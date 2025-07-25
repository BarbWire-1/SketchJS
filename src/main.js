import "./parseDSL.js"
// TODO STYLING!!!!!!!
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
/*
const themeSelector = document.getElementById("themeSwitcher");
const wrapper = document.getElementById("output");

themeSelector.addEventListener("change", function () {
	wrapper.className = this.value;
});
*/

document.querySelectorAll('.button-group-2 button').forEach(button => {
	button.addEventListener('click', () => {
		const theme = button.getAttribute('data-theme'); // get theme from button attr
		document.body.className = theme; // replace entire class list with theme class
	});
});
