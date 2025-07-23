import "./parseDSL.js"

document.getElementById("dslInput").addEventListener("keydown", function (e) {
	if (e.key === "Tab") {
		e.preventDefault();
		const textarea = e.target;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;

		// Set textarea value to: text before caret + tab + text after caret
		textarea.value =
			textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);

		// Put caret after the inserted tab
		textarea.selectionStart = textarea.selectionEnd = start + 1;
	}
});
