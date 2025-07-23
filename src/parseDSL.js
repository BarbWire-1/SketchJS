// TODO - REFACTOR
(() => {
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

	function parseDSL(input) {
		const lines = input.split("\n");
		let currentClassName = null;
		let currentSectionName = null;
		const data = {
			classes: {},
			functions: [],
		};
		let currentLineIndex = 0;

		function addClassProperty(className, sectionName, property) {
			data.classes[ className ][ sectionName ].push(property);
		}

		function addInlineObjectProperty(className, sectionName, propName, nestedProps) {
			addClassProperty(className, sectionName, {
				name: propName,
				type: "inlineObject",
				typeProps: nestedProps,
				default: null,
			});
		}

		function addTypedProperty(className, sectionName, name, type, defaultVal) {
			addClassProperty(className, sectionName, {
				name: name.trim(),
				type: type.trim(),
				default:
					defaultVal !== undefined && defaultVal !== null
						? defaultVal.trim()
						: null,
			});
		}

		function addSimpleProperty(className, sectionName, name, defaultVal) {
			addClassProperty(className, sectionName, {
				name: name.trim(),
				type: null,
				default:
					defaultVal !== undefined && defaultVal !== null
						? defaultVal.trim()
						: null,
			});
		}

		// Extracted helper to handle section names (removes trailing colon)
		function parseSectionHeader(line) {
			return line.endsWith(":") ? line.slice(0, -1) : null;
		}

		while (currentLineIndex < lines.length) {
			const rawLine = lines[ currentLineIndex ];
			const indentLevel = countIndent(rawLine);
			const line = rawLine.trim();

			if (!line) {
				currentLineIndex++;
				continue;
			}

			// Handle class or function section headers
			if (indentLevel === 0) {
				// Detect inheritance: ClassName > BaseClassName:
				const inheritanceMatch = line.match(/^(\w+)\s*>\s*(\w+):$/);
				if (inheritanceMatch) {
					currentClassName = inheritanceMatch[ 1 ];
					const baseClass = inheritanceMatch[ 2 ];
					currentSectionName = null;
					if (!data.classes[ currentClassName ]) {
						data.classes[ currentClassName ] = {
							baseClass: baseClass,
							props: [],
							parameters: [],
							methods: [],
						};
					}
					currentLineIndex++;
					continue;
				}

				// Regular class header (no inheritance)
				const classNameCandidate = parseSectionHeader(line);
				if (classNameCandidate) {
					currentClassName = classNameCandidate;
					currentSectionName = null;
					if (
						currentClassName !== "functions" &&
						!data.classes[ currentClassName ]
					) {
						data.classes[ currentClassName ] = {
							baseClass: null,
							props: [],
							parameters: [],
							methods: [],
						};
					}
					currentLineIndex++;
					continue;
				}
			}

			// Handle first level sections inside classes or functions list
			if (indentLevel === 1) {
				if (currentClassName === "functions") {
					data.functions.push(line);
					currentLineIndex++;
					continue;
				}

				const sectionNameCandidate = parseSectionHeader(line);
				if (sectionNameCandidate) {
					currentSectionName = sectionNameCandidate;
					currentLineIndex++;
					continue;
				}
			}

			// Handle nested properties or methods
			if (indentLevel === 2 && currentClassName && currentSectionName) {
				if ([ "props", "parameters" ].includes(currentSectionName)) {
					const inlineObjectMatch = line.match(/^([\w$]+)\s*:\s*{$/);
					if (inlineObjectMatch) {
						const propName = inlineObjectMatch[ 1 ];
						const nestedResult = parseNestedProps(lines, currentLineIndex + 1, indentLevel);
						addInlineObjectProperty(currentClassName, currentSectionName, propName, nestedResult.props);
						currentLineIndex = nestedResult.nextIndex;
						continue;
					}

					const typedPropertyMatch = line.match(/^([\w$]+)\s*:\s*([^\=]+)(?:=\s*(.+))?$/);
					if (typedPropertyMatch) {
						addTypedProperty(
							currentClassName,
							currentSectionName,
							typedPropertyMatch[ 1 ],
							typedPropertyMatch[ 2 ],
							typedPropertyMatch[ 3 ]
						);
						currentLineIndex++;
						continue;
					}

					const simplePropertyMatch = line.match(/^([\w$]+)(?:\s*=\s*(.+))?$/);
					if (simplePropertyMatch) {
						addSimpleProperty(
							currentClassName,
							currentSectionName,
							simplePropertyMatch[ 1 ],
							simplePropertyMatch[ 2 ]
						);
						currentLineIndex++;
						continue;
					}

					currentLineIndex++;
					continue;
				} else if (currentSectionName === "methods") {
					data.classes[ currentClassName ].methods.push(line);
					currentLineIndex++;
					continue;
				}
			}

			currentLineIndex++;
		}

		return data;
	}

	function isClassType(typeName, classes) {
		return Object.prototype.hasOwnProperty.call(classes, typeName);
	}

	function isClassArrayType(typeName, classes) {
		const match = typeName.match(/^(\w+)\[\]$/);
		return match && isClassType(match[ 1 ], classes);
	}

	function generateJS() {
		const inputText = document.getElementById("dslInput").value;
		const parsedData = parseDSL(inputText);

		let outputCode = "";
		outputCode += "const DEBUG = true;\n";
		outputCode += "function log(msg) {\n  if (DEBUG) console.log(msg);\n}\n\n";

		// Helpers with closures over parsedData.classes
		function isClassTypeLocal(type) {
			return isClassType(type, parsedData.classes);
		}

		function isClassArrayTypeLocal(type) {
			return isClassArrayType(type, parsedData.classes);
		}

		function renderNestedObjectInit(typeProps) {
			const parts = typeProps.map((prop) => {
				const val = prop.default !== null ? prop.default : "null";
				return `${prop.name}: ${val}`;
			});
			return `{ ${parts.join(", ")} }`;
		}

		function parseMethodSignature(methodSignature) {
			const match = methodSignature.match(/^(\w+)\((.*)\)$/);
			if (!match) return { name: methodSignature, params: "" };

			const name = match[ 1 ];
			const params = match[ 2 ]
				.split(",")
				.map((param) => param.trim().split(":")[ 0 ])
				.filter(Boolean)
				.join(", ");
			return { name, params };
		}

		function generateClassConstructor(cls) {
			const paramList = cls.parameters.map((p) => p.name).join(", ");
			let constructorCode = `  constructor(${paramList}${paramList ? ", " : ""}args = {}) {\n`;

			// Call super(...) if baseClass exists
			if (cls.baseClass) {
				constructorCode += `    super(${paramList});\n`;
			}

			// Assign constructor parameters with defaults
			for (const param of cls.parameters) {
				const defaultVal = param.default !== null ? param.default : "null";
				constructorCode += `    this.${param.name} = ${param.name} !== undefined ? ${param.name} : ${defaultVal};\n`;
			}

			// Assign properties from args with defaults or new objects
			for (const prop of cls.props) {
				if (prop.type === "inlineObject") {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? ${renderNestedObjectInit(prop.typeProps)};\n`;
				} else if (prop.default !== null && prop.default !== undefined) {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? ${prop.default};\n`;
				} else if (prop.type) {
					if (isClassTypeLocal(prop.type)) {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? new ${prop.type}();\n`;
					} else if (isClassArrayTypeLocal(prop.type)) {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? [];\n`;
					} else {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? null;\n`;
					}
				} else {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? null;\n`;
				}
			}

			constructorCode += "  }\n\n";
			return constructorCode;
		}

		function generateClassMethods(cls) {
			let methodsCode = "";
			for (const methodSignature of cls.methods) {
				const { name, params } = parseMethodSignature(methodSignature);
				methodsCode += `  ${name}(${params}) {\n`;
				methodsCode += `    log("Running '${name}'");\n`;
				methodsCode += `    // TODO: Implement ${name}\n`;
				methodsCode += `  }\n\n`;
			}
			return methodsCode;
		}

		function generateFunctionCode(funcSignature) {
			const { name, params } = parseMethodSignature(funcSignature);
			let functionCode = `function ${name}(${params}) {\n`;
			functionCode += `  log("Running '${name}'");\n`;
			functionCode += `  // TODO: Implement ${name}\n`;
			functionCode += `}\n\n`;
			return functionCode;
		}

		// Generate classes
		for (const className in parsedData.classes) {
			const cls = parsedData.classes[ className ];
			const extendsPart = cls.baseClass ? ` extends ${cls.baseClass}` : "";
			outputCode += `class ${className}${extendsPart} {\n`;
			outputCode += generateClassConstructor(cls);
			outputCode += generateClassMethods(cls);
			outputCode += "}\n\n";
		}

		// Generate standalone functions
		for (const func of parsedData.functions) {
			outputCode += generateFunctionCode(func);
		}

		document.getElementById("output").textContent = outputCode.trim();
		renderStructureDiagram(parsedData);
		renderMermaidDiagram(parsedData); // Assuming you want to keep this call
	}


	function renderStructureDiagram(parsed) {
		const container = document.getElementById("structureDiagram");
		container.innerHTML = "";

		function renderProps(props, indent = 0) {
			const indentStr = "  ".repeat(indent);
			return props.map((p) => {
				if (p.type === "inlineObject") {
					return `${indentStr}${p.name}: {\n${renderProps(
						p.typeProps,
						indent + 1
					).join("\n")}\n${indentStr}}`;
				}
				return `${indentStr}${p.name}: ${p.type || "any"}${p.default ? ` = ${p.default}` : ""
					}`;
			});
		}

		// Generic renderer helper for sections with fallback text
		function renderSection(title, items, renderFn) {
			const lines = [];
			lines.push(`${title}:`);
			if (items.length) {
				lines.push(...renderFn(items));
			} else {
				lines.push("  (none)");
			}
			return lines;
		}

		// Map section names to their render functions
		const sectionRenderers = {
			parameters: (items) =>
				items.map(
					(p) =>
						`  ${p.name}: ${p.type || "any"}${p.default ? ` = ${p.default}` : ""
						}`
				),
			props: (items) => renderProps(items),
			methods: (items) => items.map((m) => `  ${m}`)
		};

		for (const className in parsed.classes) {
			const cls = parsed.classes[ className ];

			const wrapper = document.createElement("div");
			const header = document.createElement("div");
			header.className = "collapsible";
			header.textContent = className;

			const content = document.createElement("div");
			content.className = "content";

			const lines = [];

			// Loop through each section using the map instead of if/else
			for (const section of [ "parameters", "props", "methods" ]) {
				const renderFn = sectionRenderers[ section ];
				const items = cls[ section ] || [];
				lines.push(...renderSection(section, items, renderFn));
				lines.push(""); // add blank line between sections for readability
			}

			const pre = document.createElement("pre");
			pre.textContent = lines.join("\n");
			content.appendChild(pre);

			// Collapsible toggle
			header.addEventListener("click", () => {
				header.classList.toggle("active");
				content.classList.toggle("active");
			});

			wrapper.appendChild(header);
			wrapper.appendChild(content);
			container.appendChild(wrapper);
		}
	}

	function renderMermaidDiagram(parsed) {
		const lines = [ "classDiagram" ];
		const relationsSet = new Set();

		// Sanitize text for Mermaid
		function sanitize(text) {
			return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}

		// Check if type is a known class
		function isClassType(typeName) {
			return parsed.classes.hasOwnProperty(typeName);
		}

		// Render constructor signature line(s)
		function renderConstructor(cls) {
			if (cls.parameters && cls.parameters.length > 0) {
				const params = cls.parameters.map((p) => p.name).join(", ");
				return [ `+constructor(${sanitize(params)})` ];
			}
			return [ "+constructor()" ];
		}

		// Render all props lines for a class
		function renderProps(cls) {
			return cls.props.map((prop) => {
				const typeStr = prop.type || "any";
				if (prop.default !== null && prop.default !== undefined) {
					return `+${prop.name}: ${sanitize(typeStr)} = ${sanitize(
						prop.default
					)}`;
				}
				return `+${prop.name}: ${sanitize(typeStr)}`;
			});
		}

		// Render all method lines for a class
		function renderMethods(cls) {
			return cls.methods.map((method) => {
				let methodName = method;
				let params = "";
				const m = method.match(/^(\w+)\((.*)\)$/);
				if (m) {
					methodName = m[ 1 ];
					params = m[ 2 ]
						.split(",")
						.map((p) => p.trim().split(":")[ 0 ])
						.filter(Boolean)
						.join(", ");
				}
				return `+${sanitize(methodName)}(${sanitize(params)})`;
			});
		}

		// Build a collections map for "has-one (selected from ...)" labels
		function getCollectionsMap(cls) {
			const collections = {};
			for (const prop of cls.props) {
				if (typeof prop.type !== "string") continue;
				const arrMatch = prop.type.match(/^(\w+)\[\]$/);
				if (arrMatch) {
					collections[ arrMatch[ 1 ] ] = prop.name;
				}
			}
			return collections;
		}

		// Add a "has-many" relation if not already added
		function addHasManyRelation(className, baseType) {
			const relKey = `${className}->${baseType}_has-many`;
			if (!relationsSet.has(relKey)) {
				lines.push(`${className} "1" --> "0..*" ${baseType} : has-many`);
				relationsSet.add(relKey);
			}
		}

		// Add a "has-one" or "has-a" relation if not already added
		function addHasOneRelation(className, targetType, label) {
			const relKey = `${className}->${targetType}_${label}`;
			if (!relationsSet.has(relKey)) {
				lines.push(`${className} "1" --> "1" ${targetType} : ${label}`);
				relationsSet.add(relKey);
			}
		}

		for (const className in parsed.classes) {
			const cls = parsed.classes[ className ];
			const classBodyLines = [
				...renderConstructor(cls),
				...renderProps(cls),
				...renderMethods(cls)
			];

			lines.push(
				`class ${className} {\n  ${classBodyLines.join("\n  ")}\n}`
			);

			const collections = getCollectionsMap(cls);

			for (const prop of cls.props) {
				if (typeof prop.type !== "string") continue;

				const arrMatch = prop.type.match(/^(\w+)\[\]$/);
				if (arrMatch) {
					const baseType = arrMatch[ 1 ];
					if (isClassType(baseType)) {
						addHasManyRelation(className, baseType);
					}
					continue;
				}

				if (isClassType(prop.type)) {
					let label = "has-a";
					if (collections.hasOwnProperty(prop.type)) {
						label = `has-one (selected from ${collections[ prop.type ]
							})`;
					}
					addHasOneRelation(className, prop.type, label);
				}
			}
		}

		// Render Mermaid
		const container = document.getElementById("mermaidDiagram");
		container.innerHTML = `<div class="mermaid">\n${lines.join("\n")}\n</div>`;
		if (window.mermaid) {
			window.mermaid.init(undefined, container.querySelector(".mermaid"));
		}
		const textarea = document.getElementById("dslInput");
		textarea.addEventListener("keydown", function (e) {
			if (e.key === "Tab") {
				e.preventDefault();
				const start = this.selectionStart;
				const end = this.selectionEnd;
				this.value =
					this.value.substring(0, start) +
					"\t" +
					this.value.substring(end);
				this.selectionStart = this.selectionEnd = start + 1;
			}
		});
	}

	///
	function svgToBase64DataUrl(svgElement) {
		const svgData = new XMLSerializer().serializeToString(svgElement);
		const base64 = btoa(unescape(encodeURIComponent(svgData)));
		return `data:image/svg+xml;base64,${base64}`;
	}
	/////

	async function downloadMarkdown() {
		const dslInput = document.getElementById("dslInput").textContent;
		const outputCode = document.getElementById("output").textContent;

		const svgElement = document.querySelector("#mermaidDiagram svg");

		let mermaidImageMarkdown = "*Mermaid diagram not found.*";

		if (svgElement) {
			const dataUrl = svgToBase64DataUrl(svgElement);
			mermaidImageMarkdown = `![Mermaid Diagram](${dataUrl})`;
		}

		const mdContent = [
			"# Sketched Classes\n",
			"```js",
			dslInput,
			"```",
			"\n# Generated JS\n",
			"```",
			outputCode,
			"```",
			"\n# Mermaid Diagram\n",
			mermaidImageMarkdown
		].join("\n");

		const blob = new Blob([ mdContent ], {
			type: "text/markdown;charset=utf-8"
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "output.md";
		a.click();
		URL.revokeObjectURL(url);
	}


	window.generateJS = generateJS;
	window.downloadMarkdown = downloadMarkdown;
})();