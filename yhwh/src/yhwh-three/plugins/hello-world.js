export default function helloWorld(app) {
  return app.addCommand({
    id: "hello-world",
    name: "Hello, world",
    icon: "sparkles",
    run: () => app.notify(app.copy.hello),
  });
}
