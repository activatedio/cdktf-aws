class CIDR {
  value: number;
  mask: number;

  constructor(cidr: string) {
    const regexp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
    const match = cidr.match(regexp);

    if (match === null) {
      throw new Error('invalid cidr ' + cidr);
    }

    console.log(match);

    this.value = 1;
    this.mask = 1;
  }
}

export {CIDR};
