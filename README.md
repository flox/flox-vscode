# Flox: Your devenvironment, everywhere.

<p align="center">
  <img src="./assets/demo.gif" width="100%" />
</p>

<img src="./assets/icon.png" align="right" width="128" height="128">

[Flox](https://flox.dev) is a virtual environment and package manager all in
one. With Flox you create environments that layer and replace dependencies just
where it matters, making them portable across the full software lifecycle.

`flox-vscode` is a VSCode extension that integrates Flox environments with
VSCode.

* 📖 Flox documentation can be found [here](https://flox.dev/docs).
* 🚀 Get in touch: [Slack](https://go.flox.dev/slack), [Discourse](https://discourse.flox.dev)
* 🤝 Found a bug? Missing a specific feature? Feel free to [file a new issue][new-issue].

[new-issue]: https://github.com/flox/flox-vscode/issues/new/choose


## FAQ

### Why do you need to restart VSCode when activating Flox environment?

This is needed to ensure Flox environment is loaded first and software from
Flox environment will be already in the `$PATH` for other VSCode extensions to
use it.


## ⭐️ Contribute

We welcome contributions to this project. Please read the [Contributor
guide](./CONTRIBUTING.md) first.

## 🪪 License

The Flox CLI is licensed under the GPLv2. See [LICENSE](./LICENSE).
