#!/usr/bin/env sh
git config --global user.email "travis@travis-ci.org"
git config --global user.name "Travis CI"
git clone https://${GITHUB_TOKEN}@github.com/bobvanderlinden/nixpkgs-ruby nixpkgs-ruby
rm -rf nixpkgs-ruby/versions