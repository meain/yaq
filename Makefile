build:
	zip -r gn.zip LICENSE README.md assets/ api.js background.js content.js history.js manifest.json options.html options.js popup.css popup.html popup.js tools.js showdown.min.js
clean:
	rm -rf gn.zip