const safeCastRequest = Symbol('safeCastRequest');

// castv2-client 1.2.0 assumes every successful media response contains
// status[0]. Some Chromecast firmware sends an empty acknowledgement first.
function normalizeCastPlayerResponses(player) {
  if (!player || typeof player.request !== 'function' || player[safeCastRequest]) {
    return player;
  }

  const fallbackStatus = () => player.currentSession || {
    mediaSessionId: 0,
    playerState: 'BUFFERING',
    currentTime: 0
  };
  const request = player.request.bind(player);
  player.request = (data, callback) => request(data, (error, response) => {
    if (!error && response && (!Array.isArray(response.status) || response.status.length === 0)) {
      console.warn(`[Cast] ${response.type || data.type} returned without media status; using the current session until the next status event.`);
      response.status = [fallbackStatus()];
    }
    callback(error, response);
  });
  player[safeCastRequest] = true;
  return player;
}

module.exports = { normalizeCastPlayerResponses };
