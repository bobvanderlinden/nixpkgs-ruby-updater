#!/bin/sh
cd nixpkgs-ruby
git add --all
git commit --message "Travis build: $TRAVIS_BUILD_NUMBER"
git push https://${GITHUB_TOKEN}@github.com/bobvanderlinden/nixpkgs-ruby master
