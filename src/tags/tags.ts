const NAME_KEY = 'Name';
const DESCRIPTION_KEY = 'Description';

class Tags {
  private tags: {[key: string]: string};

  constructor(tags: {[key: string]: string}) {
    this.tags = tags;
  }

  getTags(): {[key: string]: string} {
    return this.tags;
  }

  /*
  Returns existing tags but replaces just the name
  */
  withName(name: string, description?: string): Tags {
    const result: {[key: string]: string} = {};

    for (const prop in this.tags) {
      result[prop] = this.tags[prop];
    }

    result[NAME_KEY] = name;

    if (description) {
      result[DESCRIPTION_KEY] = description;
    }

    return new Tags(result);
  }

  /*
  Returns existing tags replacing provided names
  */
  withTags(tags: {[key: string]: string}): Tags {
    const result: {[key: string]: string} = {};

    for (const prop in this.tags) {
      result[prop] = this.tags[prop];
    }
    for (const prop in tags) {
      result[prop] = tags[prop];
    }

    return new Tags(result);
  }
}

function createTags(prototypeTags: {[key: string]: string}): Tags {
  return new Tags(prototypeTags);
}

export {Tags, createTags};
