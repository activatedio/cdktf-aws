// v1.1.2
const https = require('https');
const zlib = require('zlib');

const endpoint = process.env.OS_ENDPOINT;
const username = process.env.LOGSTASH_USERNAME;
const password = process.env.LOGSTASH_PASSWORD;

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
    elasticsearchBulkData.forEach(esb => {
      post(esb, (error, responseBody, statusCode) => {
        console.log(
          'Response: ' +
            JSON.stringify({
              statusCode: statusCode,
            })
        );

        if (error) {
          context.fail(responseBody);
        } else {
          console.log('Success: ' + responseBody);
          context.succeed('Success');
        }
      });
    });
  });
};

function transform(payload) {
  if (payload.messageType === 'CONTROL_MESSAGE') {
    return null;
  }
  const bulkRequestBody = [];
  payload.logEvents.forEach(logEvent => {
    const source = buildSource(logEvent.message);
    const output = {};
    output['@id'] = logEvent.id;
    output['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
    output['@owner'] = payload.owner;
    output['@log_group'] = payload.logGroup;
    output['@log_stream'] = payload.logStream;
    output['message'] = source;
    bulkRequestBody.push(output);
  });
  return bulkRequestBody;
}

function buildSource(message) {
  const jsonSubString = extractJson(message);
  if (jsonSubString !== null) {
    const parsedSubString = JSON.parse(jsonSubString);
    removeDotNotationFromKeys(parsedSubString);
    return parsedSubString;
  }

  return {};
}

function removeDotNotationFromKeys(obj) {
  Object.keys(obj).forEach(key => {
    const newKeyName = key.replaceAll('.', '_');
    if (newKeyName !== key) {
      obj[newKeyName] = obj[key];
      delete obj[key];
    }
    if (typeof obj[newKeyName] === 'object') {
      removeDotNotationFromKeys(obj[newKeyName]);
    }
  });
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

function post(body, callback) {
  const requestParams = buildRequest(endpoint, body);

  const request = https
    .request(requestParams, response => {
      let responseBody = '';
      response.on('data', chunk => {
        responseBody += chunk;
      });

      response.on('end', () => {
        let error = false;
        if (response.statusCode !== 200) {
          error = true;
        }

        callback(error, responseBody, response.statusCode);
      });
    })
    .on('error', e => {
      callback(e);
    });
  request.end(requestParams.body);
}

function buildRequest(endpoint, body) {
  const bodyParsed = JSON.stringify(body);
  return {
    host: endpoint,
    method: 'POST',
    path: '/',
    body: bodyParsed,
    headers: {
      'Content-Type': 'application/json',
      Host: endpoint,
      'Content-Length': Buffer.byteLength(bodyParsed),
      Authorization:
        'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    },
  };
}
