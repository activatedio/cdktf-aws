import {CIDR} from '../../src/vpc/cidr';

describe('CIDR', () => {
  it('disallows invalid input', () => {
    try {
      new CIDR('invalid');
      fail('should have raised error');
    } catch (e) {
      expect(e).toEqual(new Error('invalid cidr invalid'));
    }
  });

  /*
  it("disallows invalid numbers", () =>{

    try {
      new CIDR("256.256.256.256/33")
      fail("should have raised error")
    } catch (e) {
      expect(e).toEqual(new Error("invalid cidr invalid"))
    }

  })

  it("returns string property", () =>{

    const input = "192.168.1.0/24"

    const unit = new CIDR(input)

    expect(unit.toString()).toEqual(input)

  })
  */
});
