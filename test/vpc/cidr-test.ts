import {createCIDR} from '../../src/vpc/cidr';

describe('CIDR', () => {
  it('disallows invalid input', () => {
    try {
      createCIDR('invalid');
      fail('should have raised error');
    } catch (e) {
      expect(e).toEqual(new Error('invalid cidr invalid'));
    }
  });

  it('disallows invalid numbers', () => {
    try {
      createCIDR('256.256.256.256/33');
      fail('should have raised error');
    } catch (e) {
      expect(e).toEqual(new Error('invalid cidr 256.256.256.256/33'));
    }
  });

  it('disallows invalid mask', () => {
    try {
      createCIDR('192.168.1.0/16');
      fail('should have raised error');
    } catch (e) {
      expect(e).toEqual(new Error('invalid cidr'));
    }
  });

  it('returns string property', () => {
    const input = '192.168.1.0/24';

    const unit = createCIDR(input);

    expect(unit.toCidrString()).toEqual(input);
  });

  it('returns next', () => {
    const input = '192.168.1.0/26';

    const unit = createCIDR(input);

    expect(unit.toCidrString()).toEqual(input);

    const next = unit.next();

    expect(next.toCidrString()).toEqual('192.168.1.64/26');
  });

  it('add octet', () => {
    const input = '10.1.0.0/16';

    const unit = createCIDR(input);

    const added = unit.addOctet(2, 3, 24);

    expect(unit.toCidrString()).toEqual('10.1.0.0/16');
    expect(added.toCidrString()).toEqual('10.1.3.0/24');
  });
});
