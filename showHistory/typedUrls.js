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
      'maxResults': 1000      // how many results can get on average?...
    },
    function(historyItems) {
      var mappedHistory = historyItems.filter((val, index, array) => {
        //url has to exist
        return val.url != null && val.url != "";
      }).map((val, index, array) => {
        var trimUrl = val.url.match(URL_REGEX);
        if (trimUrl != null && trimUrl.length > 0) {
          return trimUrl[0];
        }
        return "";
      });

      var TRACKED = 31;

      // use hash to count
      var counts = {};
      mappedHistory.forEach(function (val) {
        if(val in counts) {
          counts[val].count++;
        } else {
          counts[val] = {};
          counts[val].name = val;
          counts[val].count = 1;
        }
      });

      // transfer to array to sort (probably improve this)
      var rankings = [];
      for(var key in counts) {
        rankings.push(counts[key]);
      }
      for(var i = 0; i < TRACKED; i++) {
        rankings.sort(function (a, b) {
            return b.count - a.count;
        });
      }

      trackedSites = [];
      trackedSites.push('OTHER');
      rankings.slice(0, TRACKED).forEach(function (val) {
        trackedSites.push(val.name);
      });


      console.log('rankings:');
      console.log(rankings);
      console.log('trackedSites:');
      console.log(trackedSites);

      // final map from site to value
      siteToIndex = {};
      trackedSites.forEach(function (val, index) {
        siteToIndex[val] = index;
      });

      // default 0 for "other" sites
      function ind(val) {
        if(val in siteToIndex) {
          return siteToIndex[val];
        } else {
          return 0;
        }
      }

      // turn history into training data
      trainingData = [];
      mappedHistory.forEach(function(val, index, arr) {
        if(index+1 < mappedHistory.length) {
          var input = new Array(TRACKED+1).fill(0);
          var output = new Array(TRACKED+1).fill(0);
          input[ind(val)] = 1;
          output[ind(arr[index+1])] = 1;

          trainingData.push({
            input: input,
            output: output
          });
        }
      });

      console.log('trainingData:');
      console.log(trainingData);

      var pp;
      // Persistent storage over sessions (cache)
      // For testing purposes, delete this by running:
      // localStorage.removeItem('pagePredictor');
      var storedPP = localStorage['pagePredictor'];
      if (storedPP) {
        pp = synaptic.Network.fromJSON(storedPP); // Retrieve network
        // PPLab.pp.activate doesn't work given the Network apparently...
        // TODO: Fix ^ if possible?
        // TODO: Add new data?
      } else {
        pp = new synaptic.Architect.LSTM(TRACKED+1,6,8,8,8,TRACKED+1);
      
        pp.trainer.train(trainingData, {
          rate: 2,
          iterations: 1,
          shuffle: false,
          log: 1000,  
          error: .0005
        });
        console.log("pp");
        console.log(pp);
        localStorage['pagePredictor'] = pp.toJSON(); // Stores the network
      }

      // export for fiddling
      // copy paste for test input
      // [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0]
      // or
      // var test = new Array(32).fill(0);
      // test.fill(0)[8] = 1;

      window.PPLab = {};
      window.PPLab.pp = pp;
      window.PPLab.map = siteToIndex;
      window.PPLab.test = function (index) {
        var test = new Array(TRACKED+1).fill(0);
        test[index] = 1;
        return PPLab.pp.activate(test);
      }

      
    }
  );
});