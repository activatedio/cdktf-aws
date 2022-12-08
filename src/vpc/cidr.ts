class CIDR {
  private factors = [Math.pow(256, 3), Math.pow(256, 2), 256, 1];

  public value = 0;
  public mask = 0;

  fromString(cidr: string) {
    const regexp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
    const match = cidr.match(regexp);

    if (match === null) {
      throw new Error('invalid cidr ' + cidr);
    }

    for (let i = 0; i < 4; i++) {
      const part = parseInt(match[i + 1]);

      if (part > 255) {
        throw new Error('invalid cidr ' + cidr);
      }

      this.value = this.value + part * this.factors[i];
    }

    this.setMask(parseInt(match[5]));

    this.validate();
  }

  private setMask(mask: number) {
    this.mask = 32 - mask;
  }

  private validate() {
    if (this.value % Math.pow(2, this.mask) !== 0) {
      throw new Error('invalid cidr');
    }
  }

  addOctet(index: number, value: number, mask: number): CIDR {
    if (index < 0 || index > 3) {
      throw new Error('invalid index');
    }

    const _addend = value * this.factors[index];

    const result = new CIDR();

    result.value = this.value + _addend;
    result.setMask(mask);

    result.validate();

    return result;
  }

  toCidrString(): string {
    const octets: number[] = [];
    let _value = this.value;

    for (let i = 0; i < 4; i++) {
      octets.push(Math.floor(_value / this.factors[i]));
      _value = _value % this.factors[i];
    }

    return `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3]}/${
      32 - this.mask
    }`;
  }

  next(): CIDR {
    const result = new CIDR();

    result.value = this.value + Math.pow(2, this.mask);
    result.mask = this.mask;

    result.validate();

    return result;
  }
}

function createCIDR(input: string): CIDR {
  const result = new CIDR();

  result.fromString(input);

  return result;
}

export {CIDR, createCIDR};
