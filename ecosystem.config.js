module.exports = {
  apps: [
    {
      name: "api-vps",
      script: "./src/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
