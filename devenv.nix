{
  pkgs,
  lib,
  config,
  ...
}:

let
  # nixpkgs' Chromium for @playwright/test. Each Playwright version looks for its own build, so
  # @playwright/test has to be the version of nixpkgs' playwright-driver, which e2e/global-setup.ts
  # checks.
  playwright = {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers.override {
      withFirefox = false;
      withWebkit = false;
      withFfmpeg = false;
    }}";
    PLAYWRIGHT_BROWSERS_VERSION = pkgs.playwright-driver.version;
  }
  // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
    # Playwright looks for the libraries a browser needs where a distribution keeps them, which isn't
    # where Nix does.
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
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
    # For one-off checks. The end-to-end tests drive their browser with @playwright/test.
    (pkgs.callPackage ./nix/playwright-cli { nodejs = config.languages.javascript.package; })
  ];

  env =
    playwright
    // lib.optionalAttrs (pkgs.stdenv.hostPlatform.isLinux && !config.devenv.isTesting) {
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
  };
}
