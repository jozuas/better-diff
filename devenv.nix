{ pkgs, ... }:

{
  # See full reference at https://devenv.sh/reference/options/

  languages = {
    nix.enable = true;
    javascript = {
      enable = true;
      package = pkgs.nodejs_24;
      npm.enable = true;
    };
  };

  packages = [
    pkgs.git
    pkgs.jq
    pkgs.nixfmt
    pkgs.mcp-nixos
  ];
}
