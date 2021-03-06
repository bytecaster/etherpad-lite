'use strict';
/*
 * Copyright (c) 2011 RedHog (Egil Möller) <egil.moller@freecode.no>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Basic usage:
 *
 * require("./index").require("./examples/foo.ejs")
 */

const ejs = require('ejs');
const fs = require('fs');
const hooks = require('../../static/js/pluginfw/hooks.js');
const path = require('path');
const resolve = require('resolve');
const settings = require('../utils/Settings');

const templateCache = new Map();

exports.info = {
  __output_stack: [],
  block_stack: [],
  file_stack: [],
  args: [],
};

const getCurrentFile = () => exports.info.file_stack[exports.info.file_stack.length - 1];

exports._init = (b, recursive) => {
  exports.info.__output_stack.push(exports.info.__output);
  exports.info.__output = b;
};

exports._exit = (b, recursive) => {
  getCurrentFile().inherit.forEach((item) => {
    exports._require(item.name, item.args);
  });
  exports.info.__output = exports.info.__output_stack.pop();
};

exports.begin_capture = () => {
  exports.info.__output_stack.push(exports.info.__output.concat());
  exports.info.__output.splice(0, exports.info.__output.length);
};

exports.end_capture = () => {
  const res = exports.info.__output.join('');
  exports.info.__output.splice(
      0, exports.info.__output.length, ...exports.info.__output_stack.pop());
  return res;
};

exports.begin_define_block = (name) => {
  exports.info.block_stack.push(name);
  exports.begin_capture();
};

exports.end_define_block = () => {
  const content = exports.end_capture();
  return content;
};

exports.end_block = () => {
  const name = exports.info.block_stack.pop();
  const renderContext = exports.info.args[exports.info.args.length - 1];
  const args = {content: exports.end_define_block(), renderContext};
  hooks.callAll(`eejsBlock_${name}`, args);
  exports.info.__output.push(args.content);
};

exports.begin_block = exports.begin_define_block;

exports.inherit = (name, args) => {
  getCurrentFile().inherit.push({name, args});
};

exports.require = (name, args, mod) => {
  if (args == null) args = {};

  let basedir = __dirname;
  let paths = [];

  if (exports.info.file_stack.length) {
    basedir = path.dirname(getCurrentFile().path);
  }
  if (mod) {
    basedir = path.dirname(mod.filename);
    paths = mod.paths;
  }

  const ejspath = resolve.sync(
      name,
      {
        paths,
        basedir,
        extensions: ['.html', '.ejs'],
      }
  );

  args.e = exports;
  args.require = require;

  let template;
  if (settings.maxAge !== 0) { // don't cache if maxAge is 0
    if (!templateCache.has(ejspath)) {
      template = `<% e._init(__output); %>${fs.readFileSync(ejspath).toString()}<% e._exit(); %>`;
      templateCache.set(ejspath, template);
    } else {
      template = templateCache.get(ejspath);
    }
  } else {
    template = `<% e._init(__output); %>${fs.readFileSync(ejspath).toString()}<% e._exit(); %>`;
  }

  exports.info.args.push(args);
  exports.info.file_stack.push({path: ejspath, inherit: []});
  const res = ejs.render(template, args, {cache: settings.maxAge !== 0, filename: ejspath});
  exports.info.file_stack.pop();
  exports.info.args.pop();

  return res;
};

exports._require = (name, args) => {
  exports.info.__output.push(exports.require(name, args));
};
