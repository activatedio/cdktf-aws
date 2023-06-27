with import <nixpkgs> {};

stdenv.mkDerivation {

  name = "cdktf-aws";

  buildInputs = with pkgs; [
    nodejs-18_x
    yarn
  ];

}

