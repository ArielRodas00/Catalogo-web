// Levanta una app Express en un puerto efímero para pegarle con fetch() en los tests,
// sin depender de server.js (que exige variables de entorno y abre una conexión real a la BD).
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
