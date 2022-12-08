import {createTags} from '../../src/tags/tags';

describe('Tags', () => {
  describe('withName', () => {
    it('creates and returns prototype with name', () => {
      const unit = createTags({
        env: 'dev',
        sev: '1',
        owner: 'me',
        Name: 'ignored',
      });

      expect(unit.withName('test-name').getTags()).toEqual({
        env: 'dev',
        sev: '1',
        owner: 'me',
        Name: 'test-name',
      });

      expect(unit.withName('test-name', 'test-description').getTags()).toEqual({
        env: 'dev',
        sev: '1',
        owner: 'me',
        Name: 'test-name',
        Description: 'test-description',
      });
    });
  });
  describe('withTags', () => {
    it('creates and returns prototype with new props', () => {
      const unit = createTags({
        env: 'dev',
        sev: '1',
        owner: 'me',
        Name: 'ignored',
      });

      expect(unit.withTags({env: 'stage', sev: '2'}).getTags()).toEqual({
        env: 'stage',
        sev: '2',
        owner: 'me',
        Name: 'ignored',
      });
    });
  });
});
