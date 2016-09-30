/**
 * Train this url
 * @param HistoryItem visited
 */
chrome.history.onVisited.addListener(function trainURL(visited) {
	var urlExpression = /(?:www\.)?([0-9A-Za-z-\.@:%_\+~#=]+(\.[a-zA-Z]{2,3})+){1}/;
	var URL_REGEX = new RegExp(urlExpression);
	var TRACKED = 31;

	var trimUrl = visited.url.match(URL_REGEX);
	if (trimUrl == null || trimUrl.length < 2) {
		return;
	}
	var url = trimUrl[1];

	// Get the latest site visited before this
	chrome.history.search({
	  'text': '',
	  'maxResults': 2
	}, function gotLatestSite(historyItems) {
		if (historyItems.length == 2) {
			var recentUrl = historyItems[1].url;
			var pp;
			chrome.storage.local.get('pagePredictor', function gotPP(ppJSON){
				pp = synaptic.Network.fromJSON(ppJSON);
				trainingData = [];

			});
		}
	});

}