#!/usr/bin/env node
const GitHub = require('github-api')
const fs = require('mz/fs')
const path = require('path')
const child_process = require('mz/child_process')

const rootPath = process.env.ROOT_PATH || process.cwd()

const github = new GitHub({
  token: process.env.GITHUB_API_TOKEN
})
const repo = github.getRepo('ruby', 'ruby')

repo.constructor.prototype.listTags = function(cb) {
  return this._requestAllPages(`/repos/${this.__fullname}/tags`, null, cb);
}

async function getTags(repo) {
  if (await fs.exists('tags.json')) {
    const cachedJson = await fs.readFile('tags.json')
    return JSON.parse(cachedJson)
  }
  const {data} = await repo.listTags()
  const json = JSON.stringify(data)
  await fs.writeFile('tags.json', json)
  return data
}

async function mkdirp(directoryPath) {
  const parsedPath = path.parse(directoryPath)
  if (parsedPath.dir !== parsedPath.root) {
    await mkdirp(parsedPath.dir)
  }
  try {
    await fs.mkdir(directoryPath)
  } catch (e) {
    // Ignore error for already existing directory
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

async function run() {
  const tags = await getTags(repo)
  for (let tag of tags) {
    const tagName = tag.name
    const tarballUrl = tag.tarball_url
    console.log(tag)

    const match = /v(\d+)\_(\d+)\_(\d+)(?:_(\w+))?/.exec(tagName)
    if (!match) {
      continue
    }
    const versionSegments = Array.prototype.slice.call(match, 1).filter(segment => segment)
    console.log(versionSegments)
    const versionPath = path.join(rootPath, path.join.apply(null, versionSegments))
    const versionJsonPath = path.join(versionPath, 'meta.nix')
    if (await fs.exists(versionJsonPath)) {
      continue
    }
    await mkdirp(versionPath)
    const [stdoutBuffer, stderrBuffer] = await child_process.exec(`nix-prefetch-url --type sha256 --unpack ${tarballUrl}`)
    const stdout = stdoutBuffer.toString().trim()
    const content = new NixObject({
      owner: new NixString('ruby'),
      repo: new NixString('ruby'),
      rev: new NixString(tagName),
      sha256: new NixString(stdout)
    })
    await fs.writeFile(versionJsonPath, content.toString())

    while (versionSegments.length > 0) {
      updateDefaultNix(path.join(rootPath, versionSegments.join(path.sep)))
      versionSegments.pop()
    }
    updateDefaultNix(rootPath)
  }
}

async function updateDefaultNix(directoryPath) {
  const entities = await fs.readdir(directoryPath)
  const entitiesWithStats = await Promise.all(
    entities.map(entity =>
      fs.stat(path.join(directoryPath, entity))
        .then(stat => [entity, stat])
    )
  )
  const directories = entitiesWithStats
    .filter(([entity, stats]) => stats.isDirectory())
    .map(([entity, _]) => entity)
  
  const obj = {}
  for(let directory of directories) {
    obj[directory] = new NixImport(new NixPath(`./${directory}`))
  }
  if (await fs.exists(path.join(directoryPath, 'meta.nix'))) {
    obj['meta'] = new NixImport(new NixPath('./meta.nix'))
  }

  await fs.writeFile(path.join(directoryPath, 'default.nix'), new NixObject(obj).toString())
}

class NixImport {
  constructor(expression) {
    this.expression = expression
  }

  toString() {
    return `import ${this.expression.toString()}`
  }
}

class NixPath {
  constructor(path) {
    this.path = path
  }

  toString() {
    return this.path
  }
}

class NixString {
  constructor(string) {
    if (typeof string !== 'string') {
      throw new Error('Parameter is not a string')
    }
    this.string = string
  }

  toString() {
    return JSON.stringify(this.string)
  }
}

class NixObject {
  constructor(object) {
    if (typeof object !== 'object') {
      throw new Error('Parameter is not a object')
    }
    this.object = object
  }

  formatKey(key) {
    if (/^[a-z]\w+$/.test(key)) {
      return key
    } else {
      return new NixString(key).toString()
    }
  }

  toString() {
    const contents = Object.entries(this.object)
      .map(([key, expression]) => `  ${this.formatKey(key)} = ${expression.toString()};`)
      .join('\n')
    return `{\n${contents}\n}`
  }
}

run()