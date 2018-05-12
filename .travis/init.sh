#!/usr/bin/env sh
git config --global user.email "travis@travis-ci.org"
git config --global user.name "Travis CI"
git clone https://${GITHUB_TOKEN}@github.com/bobvanderlinden/nixpkgs-ruby nixpkgs-ruby
cp -f ruby_default.nix nixpkgs-ruby/default.nix
