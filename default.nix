with import <nixpkgs> {};

stdenv.mkDerivation {

  name = "cdktf-aws";

  buildInputs = with pkgs; [
    nodejs-16_x
    yarn
  ];

}

