async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise(function (resolve) {
    server.once('listening', resolve);
  });
  const { port } = server.address();
  try {
    await fn('http://127.0.0.1:' + port);
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
}

module.exports = { withServer };
