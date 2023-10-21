// v1.1.2
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const endpoint = process.env.OS_ENDPOINT;
const indexPrefix = process.env.INDEX_PREFIX;
const apiKey = process.env.API_KEY;

// Set this to true if you want to debug why data isn't making it to
// your Elasticsearch cluster. This will enable logging of failed items
// to CloudWatch Logs.
const logFailedResponses = false;

exports.handler = function (input, context) {
  // decode input from base64
  const zippedInput = new Buffer.from(input.awslogs.data, 'base64');

  // decompress the input
  zlib.gunzip(zippedInput, (error, buffer) => {
    if (error) {
      context.fail(error);
      return;
    }

    // parse the input from JSON
    const awslogsData = JSON.parse(buffer.toString('utf8'));

    // transform the input to Elasticsearch documents
    const elasticsearchBulkData = transform(awslogsData);

    // skip control messages
    if (!elasticsearchBulkData) {
      console.log('Received a control message');
      context.succeed('Control message handled successfully');
      return;
    }

    // post documents to the Amazon Elasticsearch Service
    post(elasticsearchBulkData, (error, success, statusCode, failedItems) => {
      console.log(
        'Response: ' +
          JSON.stringify({
            statusCode: statusCode,
          })
      );

      if (error) {
        logFailure(error, failedItems);
        context.fail(JSON.stringify(error));
      } else {
        console.log('Success: ' + JSON.stringify(success));
        context.succeed('Success');
      }
    });
  });
};

function transform(payload) {
  if (payload.messageType === 'CONTROL_MESSAGE') {
    return null;
  }

  let bulkRequestBody = '';

  payload.logEvents.forEach(logEvent => {
    const timestamp = new Date(1 * logEvent.timestamp);

    // index name format: cwl-YYYY.MM.DD
    const indexName = [
      indexPrefix + '-' + timestamp.getUTCFullYear(), // year
      ('0' + (timestamp.getUTCMonth() + 1)).slice(-2), // month
      ('0' + timestamp.getUTCDate()).slice(-2), // day
    ].join('.');

    const source = buildSource(logEvent.message, logEvent.extractedFields);
    source['@id'] = logEvent.id;
    source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
    source['@message'] = logEvent.message;
    source['@owner'] = payload.owner;
    source['@log_group'] = payload.logGroup;
    source['@log_stream'] = payload.logStream;

    const action = {create: {}};
    action.create._index = indexName;
    action.create._id = logEvent.id;

    bulkRequestBody +=
      [JSON.stringify(action), JSON.stringify(source)].join('\n') + '\n';
  });
  return bulkRequestBody;
}

function buildSource(message, extractedFields) {
  if (extractedFields) {
    const source = {};

    for (const key in extractedFields) {
      if (extractedFields.hasOwnProperty(key) && extractedFields[key]) {
        const value = extractedFields[key];

        if (isNumeric(value)) {
          source[key] = 1 * value;
          continue;
        }

        var jsonSubString = extractJson(value);
        if (jsonSubString !== null) {
          source['$' + key] = JSON.parse(jsonSubString);
        }

        source[key] = value;
      }
    }
    return source;
  }

  var jsonSubString = extractJson(message);
  if (jsonSubString !== null) {
    return JSON.parse(jsonSubString);
  }

  return {};
}

function extractJson(message) {
  const jsonStart = message.indexOf('{');
  if (jsonStart < 0) return null;
  const jsonSubString = message.substring(jsonStart);
  return isValidJson(jsonSubString) ? jsonSubString : null;
}

function isValidJson(message) {
  try {
    JSON.parse(message);
  } catch (e) {
    return false;
  }
  return true;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function post(body, callback) {
  const requestParams = buildRequest(endpoint, body);

  const request = https
    .request(requestParams, response => {
      let responseBody = '';
      response.on('data', chunk => {
        responseBody += chunk;
      });

      response.on('end', () => {
        const info = JSON.parse(responseBody);
        let failedItems;
        let success;
        let error;

        if (response.statusCode >= 200 && response.statusCode < 299) {
          failedItems = info.items.filter(x => {
            return x.create.status >= 300;
          });

          success = {
            attemptedItems: info.items.length,
            successfulItems: info.items.length - failedItems.length,
            failedItems: failedItems.length,
          };
        }

        if (response.statusCode !== 200 || info.errors === true) {
          // prevents logging of failed entries, but allows logging
          // of other errors such as access restrictions
          delete info.items;
          error = {
            statusCode: response.statusCode,
            responseBody: info,
          };
        }

        callback(error, success, response.statusCode, failedItems);
      });
    })
    .on('error', e => {
      callback(e);
    });
  request.end(requestParams.body);
}

function buildRequest(endpoint, body) {
  return {
    host: endpoint,
    method: 'POST',
    path: '/_bulk',
    body: body,
    headers: {
      'Content-Type': 'application/json',
      Host: endpoint,
      'Content-Length': Buffer.byteLength(body),
      Authorization: 'ApiKey ' + apiKey,
    },
  };
}

function hash(str, encoding) {
  return crypto.createHash('sha256').update(str, 'utf8').digest(encoding);
}

function logFailure(error, failedItems) {
  if (logFailedResponses) {
    console.log('Error: ' + JSON.stringify(error, null, 2));

    if (failedItems && failedItems.length > 0) {
      console.log('Failed Items: ' + JSON.stringify(failedItems, null, 2));
    }
  }
}
