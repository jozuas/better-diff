{
  pkgs,
  lib,
  config,
  ...
}:

let
  npmScriptHook = name: script: {
    enable = true;
    name = "npm run ${script}";
    # Paseo's own commit button runs hooks outside the devenv shell.
    entry = lib.getExe (
      pkgs.writeShellApplication {
        inherit name;
        runtimeInputs = [ config.languages.javascript.package ];
        text = "npm run ${script}";
      }
    );
    pass_filenames = false;
  };
in
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
  ]
  ++ lib.optionals (!config.devenv.isTesting) [
    # Only agents use it, through .mcp.json, and its Python dependencies often fail to build upstream.
    pkgs.mcp-nixos
    # Nothing under `devenv test` drives a browser yet.
    (pkgs.callPackage ./nix/playwright-cli { nodejs = config.languages.javascript.package; })
  ];

  env = lib.optionalAttrs (pkgs.stdenv.hostPlatform.isLinux && !config.devenv.isTesting) {
    # nixpkgs' Chromium, so a bare `playwright-cli open` works. Darwin has no nixpkgs chromium
    # and keeps playwright-cli's managed one (`playwright-cli install-browser`).
    PLAYWRIGHT_MCP_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
  };

  git-hooks.hooks = {
    nixfmt.enable = true;
    shellcheck.enable = true;
    actionlint.enable = true;
    zizmor.enable = true;
    gitleaks.enable = true;
    detect-private-keys.enable = true;
    gitlint.enable = true;
    check = npmScriptHook "check" "check";
    # Mutating the local Oxlint rules takes most of a minute, so only a commit that changes them or
    # the Stryker config waits for it. `devenv test` runs every hook on every file.
    mutate-rules = npmScriptHook "mutate-rules" "mutate:rules" // {
      files = "^(tools/oxlint/local/|stryker\\.)";
    };
  };
}
