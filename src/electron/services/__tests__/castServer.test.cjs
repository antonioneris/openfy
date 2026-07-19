const { normalizeCastPlayerResponses } = require('../castResponseNormalizer.cjs');

describe('Chromecast media response normalization', () => {
  it('always supplies status[0] when firmware returns an empty acknowledgement', done => {
    const player = {
      currentSession: null,
      request(data, callback) {
        callback(null, { type: 'MEDIA_STATUS' });
      },
    };

    normalizeCastPlayerResponses(player);
    player.request({ type: 'PLAY' }, (error, response) => {
      expect(error).toBeNull();
      expect(response.status[0]).toEqual(expect.objectContaining({ playerState: 'BUFFERING' }));
      done();
    });
  });
});
