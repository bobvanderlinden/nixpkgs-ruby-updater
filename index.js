#!/usr/bin/env node
const fs = require('mz/fs')
const path = require('path')
const request = require('request-promise-native')

const rootPath = process.env.ROOT_PATH || process.cwd()

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
  const responseBody = await request('https://raw.githubusercontent.com/postmodern/ruby-versions/master/ruby/checksums.sha256')
  const regex = /^(\w+)  (ruby-(\d+)\.(\d+)\.(\d+)(?:-(\w+))?\.tar\.gz)$/mg
  let match
  
  while ((match = regex.exec(responseBody)) !== null) {
    const sha256 = match[1]
    const filename = match[2]
    const versionSegments = Array.prototype.slice.call(match, 3).filter(segment => segment !== undefined)
    const tarballUrl = `https://cache.ruby-lang.org/pub/ruby/${filename}`

    const versionPath = path.join(rootPath, path.join.apply(null, versionSegments))
    const versionJsonPath = path.join(versionPath, 'meta.nix')
    if (await fs.exists(versionJsonPath)) {
      continue
    }
    await mkdirp(versionPath)

    const content = new NixObject({
      url: new NixString(tarballUrl),
      sha256: new NixString(sha256)
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