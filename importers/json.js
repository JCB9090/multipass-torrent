'use strict';

var needle = require('needle');
var Q = require('q');
var url = require('url');
var async = require('async');
var _ = require('lodash');
var log = require('../lib/log');
var events = require('events');
var parseTorrent = require('parse-torrent');

module.exports = function(stream, source) {
    var emitter = new events.EventEmitter();

    Q.all([getjson(source.url), parsesource(url.parse(addhttp(source.url)))]).spread(importjson);

    function importjson(json, host) {
        if (host.parsedName === 'unknown') {
            log.error('json unknown source', source);
            return;
        }
        switch (host.parsedName) {
            case 'eztv':
                processEztv(host);
                break;
            //case 'yts':
            //    log.error('json detected yts; please use https://yts.to/tz_daily.txt.gz instead', source);
            //    break;
        }
    }

    function processEztv(host) {
        var queue = async.queue(function(task, next) {
            getjson(task).then(function(response) {
                if (response.episodes) {
                    var returnObject = {
                        show_name: response.title,
                        imdb_id: response.imdb_id,
                        verified: true
                    }
                    response.episodes.forEach(function(item) {
                        _.assign(returnObject, {
                            episode_tvdb: item.tvdb_id,
                            episode_name: item.title
                        });
                        _.forEach(_.omit(item.torrents, '0'), function(t, key) { // quality 0 === 420p we remove to avoid duplicates 
                            _.assign(returnObject, {
                                quality: key
                            });
                            emitter.emit('infoHash', parseTorrent(t.url).infoHash, returnObject);
                        });
                    });
                } else if (response[0].imdb_id) {
                    response.forEach(function(item) {
                        if (host.slashes) {
                            queue.push(host.protocol + '//' + host.host + '/show/' + item.imdb_id)
                        } else {
                            queue.push(host.protocol + host.host + '/show/' + item.imdb_id)
                        }
                    });
                } else if (response && response.length > 0) {
                    response.forEach(function(url) {
                        if (host.slashes) {
                            queue.push(host.protocol + '//' + host.host + '/' + url)
                        } else {
                            queue.push(host.protocol + host.host + '/' + url)
                        }
                    });
                }

                process.nextTick(next);
            }, function(err) {
                log.error(err);
                process.nextTick(next);
            });
        }, 2);
        
        queue.drain = function() { emitter.emit('end') };

        if (host.slashes) {
            queue.push(host.protocol + '//' + host.host + '/shows')
        } else {
            queue.push(host.protocol + host.host + '/shows')
        }
    };

    function parsesource(s) {

        var eztvEndpoints = ['eztvapi.re', 'tv.ytspt.re', 'http://7aa7xwqtxoft27r2.onion'];
        var ytsEndpoints = ['yts.ag', 'yts.to', 'yts.io', 'yts.sh', 'http://gm6gttbnl3bjulil.onion'];

        if (new RegExp(eztvEndpoints.join('|')).test(s.host)) {
            s.parsedName = 'eztv';
        } else if (new RegExp(ytsEndpoints.join('|')).test(s.host)) {
            s.parsedName = 'yts';
        } else {
            s.parsedName = 'unknown';
        }

        return Q(s);
    }

    function addhttp(url) {
        if (!/^(?:f|ht)tps?\:\/\//.test(url)) {
            url = "http://" + url;
        }
        return url;
    }

    function getjson(url) {
        log.message("json getting: "+url);

        var defer = Q.defer();
        var params = {
            compressed: true, // sets 'Accept-Encoding' to 'gzip,deflate'
            follow_max: 2,
            headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.99 Safari/537.36" }
        };
        needle.get(url, params, function(error, response) {
            if (!error && response.statusCode == 200) {
                defer.resolve(response.body);
            } else {
                defer.reject(error || response.statusCode)
            }
        });
        return defer.promise;
    }

    return emitter;
}
