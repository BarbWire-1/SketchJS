// Count indentation (tabs only)
function countIndent(line) {
	let match = line.match(/^(\t*)/);
	return match ? match[ 1 ].length : 0;
}

function parseNestedProps(lines, startLineIndex, baseIndentLevel) {
	const properties = [];
	let currentIndex = startLineIndex;

	function addProperty({ name, type = null, typeProps = null, defaultValue = null }) {
		properties.push({
			name,
			type,
			typeProps,
			default:
				defaultValue !== undefined && defaultValue !== null
					? defaultValue.trim()
					: null,
		});
	}

	while (currentIndex < lines.length) {
		const line = lines[ currentIndex ];
		if (!line.trim()) {
			currentIndex++;
			continue;
		}

		const indentLevel = countIndent(line);
		if (indentLevel <= baseIndentLevel) break;

		const trimmedLine = line.trim();

		// Inline object property (e.g. propName: { )
		const inlineObjectMatch = trimmedLine.match(/^([\w$]+)\s*:\s*{$/);
		if (inlineObjectMatch) {
			const propertyName = inlineObjectMatch[ 1 ];
			const nestedResult = parseNestedProps(lines, currentIndex + 1, indentLevel);
			addProperty({
				name: propertyName,
				type: "inlineObject",
				typeProps: nestedResult.props,
				defaultValue: null,
			});
			currentIndex = nestedResult.nextIndex;
			continue;
		}

		// Typed property (e.g. propName: Type = defaultVal)
		const typedPropertyMatch = trimmedLine.match(/^([\w$]+)\s*:\s*([\w\[\]]+)(?:\s*=\s*(.+))?$/);
		if (typedPropertyMatch) {
			addProperty({
				name: typedPropertyMatch[ 1 ],
				type: typedPropertyMatch[ 2 ],
				defaultValue: typedPropertyMatch[ 3 ],
			});
			currentIndex++;
			continue;
		}

		// Simple property (e.g. propName = defaultVal)
		const simplePropertyMatch = trimmedLine.match(/^([\w$]+)(?:\s*=\s*(.+))?$/);
		if (simplePropertyMatch) {
			addProperty({
				name: simplePropertyMatch[ 1 ],
				defaultValue: simplePropertyMatch[ 2 ],
			});
			currentIndex++;
			continue;
		}

		currentIndex++;
	}

	return {
		props: properties,
		nextIndex: currentIndex,
	};
}