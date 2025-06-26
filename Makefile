build:
	zip -r gn.zip LICENSE README.md assets/ background.js content.js manifest.json options.html options.js popup.css popup.html popup.js showdown.min.js
clean:
	rm -rf gn.zip