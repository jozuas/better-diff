{
  pkgs,
  lib,
  config,
  ...
}:

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
    pkgs.mcp-nixos
  ];

  git-hooks.hooks = {
    nixfmt.enable = true;
    actionlint.enable = true;
    zizmor.enable = true;
    gitleaks.enable = true;
    detect-private-keys.enable = true;
    gitlint.enable = true;
    check = {
      enable = true;
      name = "npm run check";
      # Paseo's own commit button runs hooks outside the devenv shell.
      entry = lib.getExe (
        pkgs.writeShellApplication {
          name = "check";
          runtimeInputs = [ config.languages.javascript.package ];
          text = "npm run check";
        }
      );
      pass_filenames = false;
    };
  };
}
