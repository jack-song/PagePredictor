
/**
 * Train this url
 * @param HistoryItem visited
 */
chrome.history.onVisited.addListener(function trainURL(visited) {
  var urlExpression = /(?:www\.)?([0-9A-Za-z-\.@:%_\+~#=]+(\.[a-zA-Z]{2,3})+){1}/;
  var URL_REGEX = new RegExp(urlExpression);
  var TRACKED = 31;
  console.log("VISITED PAGE");
  // include spot for elapsed time
  // and "OTHER" websites
  var INPUT_SIZE = TRACKED+1+1;
  var OUTPUT_SIZE = TRACKED+1;

  // 1000*60*60 = 3600000 ms in an hour
  var MS_PER_HOUR = 3600000;

  var trimUrl = visited.url.match(URL_REGEX);
  if (trimUrl == null || trimUrl.length < 2) {
    return;
  }
  var url = trimUrl[1];
  var thisSite = {};
  thisSite.name = url;
  thisSite.time = visited.lastVisitTime;

  function normalizeInterval(start, end) {
    // 1000*60*60 = 3600000 ms in an hour
    var elapsed = end-start;

    if(elapsed >= 0 && elapsed <= MS_PER_HOUR) {
      return elapsed/parseFloat(MS_PER_HOUR);
    }

    // too long ago or invalid
    return 1;
  }
  chrome.storage.local.get('pagePredictor', function gotPP(ppJSON){
    // No data is saved yet
    if (Object.keys(ppJSON).length == 0) {
      console.log("training network");

      chrome.history.search( {
        'text': '',              // Return every history item....
        'startTime': 0,
        'maxResults': 2000      // adjust...
      },
      function trainNetwork(historyItems) {
        var mappedHistory = historyItems.filter((val, index, array) => {
          //url has to exist
          return val.url != null && val.url != "";
        }).map((val, index, array) => {
          var site = {};
          var trimUrl = val.url.match(URL_REGEX);

          if (trimUrl != null && trimUrl.length > 1) {
            site.name = trimUrl[1];
            site.time = val.lastVisitTime;
          }
          return site;
        });

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

        var trackedSites = [];
        trackedSites.push('OTHER');
        rankedSites.slice(0, TRACKED).forEach(function (site) {
          trackedSites.push(site.name);
        });

        // final map from site to value
        var siteToIndex = {};
        var indexToSite = {};
        trackedSites.forEach(function (site, index) {
          siteToIndex[site] = index;
          indexToSite[index] = site;
        });

        console.log("trackedSites");
        console.log(trackedSites);

        chrome.storage.local.set({'pagePredictorSites': trackedSites});
        chrome.storage.local.set({'pagePredictorS2I': siteToIndex});
        chrome.storage.local.set({'pagePredictorI2S': indexToSite});

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

        var pp = new synaptic.Architect.LSTM(INPUT_SIZE,6,8,6,OUTPUT_SIZE);

        pp.trainer.train(trainingData, {
          rate: 1,
          iterations: 1,
          shuffle: false
        });

        chrome.storage.local.set({'pagePredictor': JSON.stringify(pp.toJSON())});
      
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
    } else {
      console.log("inside of else block...");
      var pp = synaptic.Network.fromJSON(JSON.parse(ppJSON['pagePredictor'])); // Retrieve network

      chrome.storage.local.get('pagePredictorS2I', function gotTrainedSites(sitesObject){
        // Get the latest site visited before this
        // TODO: Fix this so that we can get the last two 'typed' sites
        chrome.history.search({
          'text': '',
          'maxResults': 2
        }, function gotLatestSite(historyItems) {
          if (historyItems.length < 2) {
            return;
          }
          var recentSite = {};
          recentSite.name = historyItems[1].url;
          recentSite.time = historyItems[1].lastVisitTime;
          
          var sitesToIndex = sitesObject['pagePredictorS2I'];
          // OTHER by default
          var thisIndex = 0;
          var recentIndex = 0;
          if (thisSite.name in sitesToIndex){
            thisIndex = sitesToIndex[thisSite.name];
          }
          if (recentSite.name in sitesToIndex){
            recentIndex = sitesToIndex[recentSite.name];
          }
          var trainingData = [];
          var input = new Array(INPUT_SIZE).fill(0);
          var output = new Array(OUTPUT_SIZE).fill(0);
          input[recentIndex] = 1;
          input[input.length-1] = normalizeInterval(recentSite.time, thisSite.time);
          output[thisIndex] = 1;

          trainingData.push({
            input: input,
            output: output
          });

          var trainer = new synaptic.Trainer(pp);

          trainer.train(trainingData, {
            rate: 1,
            iterations: 1,
            shuffle: false
          });
          chrome.storage.local.set({'pagePredictor': JSON.stringify(pp.toJSON())});
        });
        
      });
    }
  });



});