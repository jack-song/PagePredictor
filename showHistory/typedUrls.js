// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Event listner for clicks on links in a browser action popup.
// Open the link in a new tab of the current window.
function onAnchorClick(event) {
  chrome.tabs.create({
    selected: true,
    url: event.srcElement.href
  });
  return false;
}

// Given an array of URLs, build a DOM list of those URLs in the
// browser action popup.
function buildPopupDom(divName, data) {
  var popupDiv = document.getElementById(divName);

  var ul = document.createElement('ul');
  popupDiv.appendChild(ul);

  for (var i = 0, ie = data.length; i < ie; ++i) {
    var a = document.createElement('a');
    a.href = data[i];
    a.appendChild(document.createTextNode(data[i]));
    a.addEventListener('click', onAnchorClick);

    var li = document.createElement('li');
    li.appendChild(a);

    ul.appendChild(li);
  }
}

// Search history to find up to ten links that a user has typed in,
// and show those links in a popup.
function buildTypedUrlList(divName) {
  // To look for history items visited in the last week,
  // subtract a week of microseconds from the current time.
  var microsecondsPerWeek = 1000 * 60 * 60 * 24 * 7;
  var oneWeekAgo = (new Date).getTime() - microsecondsPerWeek;

  // Track the number of callbacks from chrome.history.getVisits()
  // that we expect to get.  When it reaches zero, we have all results.
  var numRequestsOutstanding = 0;

  chrome.history.search({
      'text': '',              // Return every history item....
      'startTime': oneWeekAgo  // that was accessed less than one week ago.
    },
    function(historyItems) {
      // For each history item, get details on all visits.
      for (var i = 0; i < historyItems.length; ++i) {
        var url = historyItems[i].url;
        var processVisitsWithUrl = function(url) {
          // We need the url of the visited item to process the visit.
          // Use a closure to bind the  url into the callback's args.
          return function(visitItems) {
            processVisits(url, visitItems);
          };
        };
        chrome.history.getVisits({url: url}, processVisitsWithUrl(url));
        numRequestsOutstanding++;
      }
      if (!numRequestsOutstanding) {
        onAllVisitsProcessed();
      }
    });


  // Maps URLs to a count of the number of times the user typed that URL into
  // the omnibox.
  var urlToCount = {};

  // Callback for chrome.history.getVisits().  Counts the number of
  // times a user visited a URL by typing the address.
  var processVisits = function(url, visitItems) {
    for (var i = 0, ie = visitItems.length; i < ie; ++i) {
      // Ignore items unless the user typed the URL.
      if (visitItems[i].transition != 'typed') {
        continue;
      }

      if (!urlToCount[url]) {
        urlToCount[url] = 0;
      }

      urlToCount[url]++;
    }

    // If this is the final outstanding call to processVisits(),
    // then we have the final results.  Use them to build the list
    // of URLs to show in the popup.
    if (!--numRequestsOutstanding) {
      onAllVisitsProcessed();
    }
  };

  // This function is called when we have the final list of URls to display.
  var onAllVisitsProcessed = function() {
    // Get the top scorring urls.
    urlArray = [];
    for (var url in urlToCount) {
      urlArray.push(url);
    }

    // Sort the URLs by the number of times the user typed them.
    urlArray.sort(function(a, b) {
      return urlToCount[b] - urlToCount[a];
    });

    buildPopupDom(divName, urlArray.slice(0, 10));
  };
}

document.addEventListener('DOMContentLoaded', function () {
  buildTypedUrlList("typedUrl_div");

  // Example: In http://stackoverflow.com/questions/12345, this matches stackoverflow.com
  var urlExpression = /([^www\.\/][0-9A-Za-z-\.@:%_\+~#=]+(\.[a-zA-Z]{2,3})+){1}/g;
  var URL_REGEX = new RegExp(urlExpression);

  chrome.history.search({
      'text': '',              // Return every history item....
      'startTime': 0,
      'maxResults': 2000      // adjust...
    },
    function(historyItems) {
      var mappedHistory = historyItems.filter((val, index, array) => {
        //url has to exist
        return val.url != null && val.url != "";
      }).map((val, index, array) => {
        var site = {};
        var trimUrl = val.url.match(URL_REGEX);

        if (trimUrl != null && trimUrl.length > 0) {
          site.name = trimUrl[0];
          site.time = val.lastVisitTime;
        }
        return site;
      });


      // 1000*60*60 = 3600000 ms in an hour
      var MS_PER_HOUR = 3600000;

      //console.log('History: ');
      //console.log(historyItems);

      var TRACKED = 31;

      // include spot for elapsed time
      // and "OTHER" websites
      var INPUT_SIZE = TRACKED+1+1;
      var OUTPUT_SIZE = TRACKED+1;

      // use hash to count
      var sites = {};
      mappedHistory.forEach(function (site) {
        if(site.name in sites) {
          sites[site.name].count++;
        } else {
          sites[site.name] = {};
          sites[site.name].name = site.name;
          sites[site.name].count = 1;
        }
      });

      // transfer to array to sort (probably improve this)
      var rankedSites = [];
      for(var mapkey in sites) {
        rankedSites.push(sites[mapkey]);
      }

      rankedSites.sort(function (a, b) {
          return b.count - a.count;
      });

      trackedSites = [];
      trackedSites.push('OTHER');
      rankedSites.slice(0, TRACKED).forEach(function (site) {
        trackedSites.push(site.name);
      });

      // console.log("site counts:");
      // console.log(sites);
      // console.log('rankedSites:');
      // console.log(rankedSites);
      //console.log('trackedSites:');
      //console.log(trackedSites);

      // final map from site to value
      siteToIndex = {};
      indexToSite = {};
      trackedSites.forEach(function (site, index) {
        siteToIndex[site] = index;
        indexToSite[index] = site;
      });

      function printTopSites(output) { 
        function getName(index) {
          if(index in indexToSite) {
            return indexToSite[index];
          } else {
            return " - ";
          }
        }
        
        // store original indices
        var indexedOutput = [];
        output.forEach(function(val, index) {
          indexedOutput.push({
            index: index,
            value: val
          });
        });

        indexedOutput.sort(function (a, b) {
            return b.value - a.value;
        });

        for(var i = 0; i < 3; i++) {
          console.log(getName(indexedOutput[i].index) + ": " + parseFloat(indexedOutput[i].value).toFixed(4));
        }
      }

      // turn history into training data
      // recent websites come before older ones
      // so closer to front of array = OUTPUT
      trainingData = [];
      mappedHistory.forEach(function(site, index, arr) {
        function normalizeInterval(start, end) {
          // 1000*60*60 = 3600000 ms in an hour
          var elapsed = end-start;

          if(elapsed >= 0 && elapsed <= MS_PER_HOUR) {
            return elapsed/parseFloat(MS_PER_HOUR);
          }

          // too long ago or invalid
          return 1;
        }

        // default 0 for "other" sites
        function getIndex(siteName) {
          if(siteName in siteToIndex) {
            return siteToIndex[siteName];
          } else {
            return 0;
          }
        }

        if(index+1 < mappedHistory.length) {
          var input = new Array(INPUT_SIZE).fill(0);
          var output = new Array(OUTPUT_SIZE).fill(0);

          var prevSite = arr[index+1];

          input[getIndex(prevSite.name)] = 1;

          // input the elapsed time since last visit
          input[input.length-1] = normalizeInterval(prevSite.time, site.time);

          output[getIndex(site.name)] = 1;

          trainingData.push({
            input: input,
            output: output
          });
        }
      });

      //console.log('trainingData:');
      //console.log(trainingData);

      var FORCE_TRAIN = true;
      var pp;
      // Persistent storage over sessions (cache)
      // For testing purposes, delete this by running:
      // localStorage.removeItem('pagePredictor');
      var FORCE_TRAIN = true;
      chrome.storage.local.get('pagePredictor', function gotPP(ppJSON){

        if (FORCE_TRAIN || Object.keys(ppJSON).length === 0) {
          pp = new synaptic.Architect.LSTM(INPUT_SIZE,6,8,6,OUTPUT_SIZE);

          pp.trainer.train(trainingData, {
            rate: 1,
            iterations: 1,
            shuffle: false
          });

          chrome.storage.local.set({'pagePredictor': JSON.stringify(pp.toJSON())});
        } else {
          pp = synaptic.Network.fromJSON(JSON.parse(ppJSON['pagePredictor'])); // Retrieve network
        }

        window.PPLab = {};
        window.PPLab.pp = pp;
        window.PPLab.map = siteToIndex;
        window.PPLab.test = function (index) {
          var input = new Array(INPUT_SIZE).fill(0);
          input[index] = 1;
          // test for different possible time intervals
          // within a minute, 5 mins, 10 mins, 30, and 1 hour+
          var times = [parseFloat(0.01), parseFloat(0.08), parseFloat(0.17), parseFloat(0.5), parseFloat(0.1)];
          times.forEach(function (time) {
            input[input.length-1] = time;
            console.log(time + ":");
            printTopSites(PPLab.pp.activate(input));
          });
        }

      });
    }
  );
});