{
  pkgs,
  nodejs,
  ...
}:

# The Playwright CLI from npm (`@playwright/cli`), for the devenv shell. The package ships
# a ready-to-run `playwright-cli.js`, so this only installs its dependencies and wraps it
# with Node.
#
# Upstream defaults to the system `chrome` channel, so the wrapper injects a config
# selecting Playwright's managed Chromium on `open`, unless `--browser`/`--config` or a
# local `.playwright/cli.config.json` already chose one.
#
# Upstream publishes no lockfile, so ./npm vendors our own and `npm ci` runs inside a
# fixed-output derivation. To bump the version:
#
#   cd nix/playwright-cli/npm
#   npm install --package-lock-only --save-exact --ignore-scripts \
#     --no-audit --no-fund --min-release-age=7 @playwright/cli@<version>
#
# ./npm has its own package.json, so the repository's .npmrc doesn't apply there and
# --min-release-age has to be passed by hand.
#
# then update `version` below and refresh `outputHash` (set it to lib.fakeHash, rebuild,
# and copy the hash from the mismatch error).

let
  inherit (pkgs) lib;
  pname = "playwright-cli";
  version = "0.1.17";

  defaultConfig = pkgs.writeText "cli.config.json" ''
    {
      "browser": {
        "browserName": "chromium"
      }
    }
  '';

  # Placeholders substituted in installPhase once $out is known.
  wrapper = pkgs.writeShellScriptBin "playwright-cli" ''
    set -eu
    # Nix pins the version, so the npm update banner is never actionable.
    export NO_UPDATE_NOTIFIER=1
    # devenv points it at the browsers of @playwright/test's Playwright, which isn't this one.
    unset PLAYWRIGHT_BROWSERS_PATH
    default_config="@defaultConfig@"
    cli="@cli@"

    has_config=0
    has_browser=0
    cmd=""
    for arg in "$@"; do
      case "$arg" in
        --config|--config=*) has_config=1 ;;
        --browser|--browser=*) has_browser=1 ;;
        -s|--session|-s=*|--session=*|--json|--raw|--help|--version) ;;
        -*) ;;
        *)
          if [ -z "$cmd" ]; then
            cmd="$arg"
          fi
          ;;
      esac
    done

    if [ "$cmd" = open ] \
      && [ "$has_config" -eq 0 ] \
      && [ "$has_browser" -eq 0 ] \
      && [ ! -f .playwright/cli.config.json ]; then
      args=()
      inserted=0
      for arg in "$@"; do
        args+=("$arg")
        if [ "$inserted" -eq 0 ] && [ "$arg" = open ]; then
          args+=(--config "$default_config")
          inserted=1
        fi
      done
      exec "$cli" "''${args[@]}"
    fi

    exec "$cli" "$@"
  '';

  node_modules = pkgs.stdenv.mkDerivation {
    pname = "${pname}-node_modules";
    inherit version;

    src = ./npm;

    nativeBuildInputs = [
      nodejs
      pkgs.cacert
    ];

    dontConfigure = true;

    buildPhase = ''
      export HOME="$TMPDIR"
      # --omit=optional keeps the tree platform-independent: @playwright/cli pulls in
      # darwin-only fsevents, which would otherwise change this hash per build system.
      npm ci \
        --omit=optional \
        --ignore-scripts \
        --no-audit \
        --no-fund \
        --no-progress
    '';

    installPhase = ''
      # Strip npm's bookkeeping copy of the lockfile: its contents vary by npm version,
      # which would make the FOD hash depend on the bundled npm.
      rm -f node_modules/.package-lock.json
      mkdir -p $out
      cp -r node_modules $out/node_modules
    '';

    dontFixup = true;

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = "sha256-REiVLueqiG0w8hx62atD4SjlqFmI4UepO7BPqqhJw/s=";
  };
in
pkgs.stdenv.mkDerivation {
  inherit pname version;

  dontUnpack = true;

  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    mkdir -p $out/bin $out/lib $out/libexec $out/share/playwright-cli
    cp -r ${node_modules}/node_modules $out/lib/node_modules
    cp ${defaultConfig} $out/share/playwright-cli/cli.config.json

    makeWrapper ${nodejs}/bin/node $out/libexec/playwright-cli \
      --add-flags $out/lib/node_modules/@playwright/cli/playwright-cli.js

    install -m755 ${wrapper}/bin/playwright-cli $out/bin/playwright-cli
    substituteInPlace $out/bin/playwright-cli \
      --replace-fail "@cli@" "$out/libexec/playwright-cli" \
      --replace-fail "@defaultConfig@" "$out/share/playwright-cli/cli.config.json"
  '';

  meta = {
    description = "CLI for common Playwright actions";
    homepage = "https://github.com/microsoft/playwright-cli";
    license = lib.licenses.asl20;
    mainProgram = "playwright-cli";
  };
}
