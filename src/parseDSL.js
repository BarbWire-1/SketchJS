// TODO - REFACTOR

//TODO - inherited class does not draw relationships to comp in own props!
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
			schemas: {}, // Added schema support
			functions: [],
		};
		let currentLineIndex = 0;

		function addClassProperty(className, sectionName, property) {
			data.classes[ className ][ sectionName ].push(property);
		}

		function addSchemaProperty(schemaName, property) {
			data.schemas[ schemaName ].props.push(property);
		}

		function addInlineObjectProperty(targetName, sectionName, propName, nestedProps) {
			const prop = {
				name: propName,
				type: "inlineObject",
				typeProps: nestedProps,
				default: null,
			};
			if (data.classes[ targetName ]) {
				addClassProperty(targetName, sectionName, prop);
			} else if (data.schemas[ targetName ]) {
				addSchemaProperty(targetName, prop);
			}
		}

		function addTypedProperty(targetName, sectionName, name, type, defaultVal) {
			const prop = {
				name: name.trim(),
				type: type.trim(),
				default: defaultVal !== undefined && defaultVal !== null ? defaultVal.trim() : null,
			};
			if (data.classes[ targetName ]) {
				addClassProperty(targetName, sectionName, prop);
			} else if (data.schemas[ targetName ]) {
				addSchemaProperty(targetName, prop);
			}
		}

		function addSimpleProperty(targetName, sectionName, name, defaultVal) {
			const prop = {
				name: name.trim(),
				type: null,
				default: defaultVal !== undefined && defaultVal !== null ? defaultVal.trim() : null,
			};
			if (data.classes[ targetName ]) {
				addClassProperty(targetName, sectionName, prop);
			} else if (data.schemas[ targetName ]) {
				addSchemaProperty(targetName, prop);
			}
		}

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

			// Handle top-level constructs
			if (indentLevel === 0) {
				// Handle schema:
				const schemaMatch = line.match(/^schema\s+(\w+):$/);
				if (schemaMatch) {
					currentClassName = schemaMatch[ 1 ];
					currentSectionName = null;
					if (!data.schemas[ currentClassName ]) {
						data.schemas[ currentClassName ] = {
							props: [],
						};
					}
					currentLineIndex++;
					continue;
				}

				// Inheritance: Class > Base:
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

				// Regular class (no inheritance)
				const classNameCandidate = parseSectionHeader(line);
				if (classNameCandidate) {
					currentClassName = classNameCandidate;
					currentSectionName = null;

					if (
						currentClassName !== "functions" &&
						!data.classes[ currentClassName ] &&
						!data.schemas[ currentClassName ]
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

			// Handle sections like props/methods
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

			// Handle properties or methods
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
//console.log(JSON.stringify(data))
		return data;
	}


	function isClassType(typeName, classes) {
		return Object.prototype.hasOwnProperty.call(classes, typeName);
	}

	function isClassArrayType(typeName, classes) {
		const match = typeName.match(/^(\w+)\[\]$/);
		return match && isClassType(match[ 1 ], classes);
	}
/*
	function generateJS() {
		const inputText = document.getElementById("dslInput").value;
		const parsedData = parseDSL(inputText);

		let outputCode = "// AUTO-GENERATED NAKED SKELETON — meant to be fleshed out step-by-step\n\n";


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
			// Remove return type (e.g., ": string", ": boolean") at the end
			methodSignature = methodSignature.replace(/:\s*\w+\s*(\/\/.*)?$/, "").trim();

			const match = methodSignature.match(/^(\w+)\((.*)\)$/);
			if (!match) return { name: methodSignature, params: "" };

			const name = match[ 1 ];
			const params = match[ 2 ]
				.split(",")
				.map((param) => param.trim().split(":")[ 0 ]) // remove types
				.filter(Boolean)
				.join(", ");

			return { name, params };
		}



		function generateClassConstructor(cls) {
			let constructorCode = `  constructor(args = {}) {\n`;

			if (cls.baseClass) {
				constructorCode += `    super(args);\n`;
			}

			// Assign constructor parameters with defaults (if you want to support explicit params, else skip)
			// Assuming you don't have explicit params, just use props from args.

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
			if ([ "props", "methods", "parameters" ].includes(className)) continue;
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
*/
	/*
	// Patch the generateJS function to skip schemas in class output and handle schema-typed props correctly
	function generateJS() {
		const inputText = document.getElementById("dslInput").value;
		const parsedData = parseDSL(inputText);

		let outputCode = "// AUTO-GENERATED NAKED SKELETON — meant to be fleshed out step-by-step\n\n";

		outputCode += "const DEBUG = true;\n";
		outputCode += "function log(msg) {\n  if (DEBUG) console.log(msg);\n}\n\n";

		function isClassTypeLocal(type) {
			return isClassType(type, parsedData.classes);
		}

		function isClassArrayTypeLocal(type) {
			return isClassArrayType(type, parsedData.classes);
		}

		function isSchemaType(type) {
			return parsedData.schemas && Object.prototype.hasOwnProperty.call(parsedData.schemas, type);
		}

		function renderNestedObjectInit(typeProps) {
			const parts = typeProps.map((prop) => {
				const val = prop.default !== null ? prop.default : "null";
				return `${prop.name}: ${val}`;  // keys without quotes here
			});
			return `{ ${parts.join(", ")} }`;
		}


		function parseMethodSignature(methodSignature) {
			methodSignature = methodSignature.replace(/:\s*\w+\s*(\/\/.*)?$/, "").trim();
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
			let constructorCode = `  constructor(args = {}) {\n`;
			if (cls.baseClass) {
				constructorCode += `    super(args);\n`;
			}

			for (const prop of cls.props) {
				if (prop.type && parsedData.schemas && parsedData.schemas[ prop.type ]) {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? {...${prop.type}};\n`;
				} else if (prop.type === "inlineObject") {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? ${renderNestedObjectInit(prop.typeProps)};\n`;
				} else if (prop.default !== null && prop.default !== undefined) {
					constructorCode += `    this.${prop.name} = args.${prop.name} ?? ${prop.default};\n`;
				} else if (prop.type) {
					if (isClassTypeLocal(prop.type)) {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? new ${prop.type}();\n`;
					} else if (isClassArrayTypeLocal(prop.type)) {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? [];\n`;
					} else if (isSchemaType(prop.type)) {
						constructorCode += `    this.${prop.name} = args.${prop.name} ?? {};\n`;
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
				methodsCode += `    log(\"Running '${name}'\");\n`;
				methodsCode += `    // TODO: Implement ${name}\n`;
				methodsCode += `  }\n\n`;
			}
			return methodsCode;
		}

		function generateFunctionCode(funcSignature) {
			const { name, params } = parseMethodSignature(funcSignature);
			let functionCode = `function ${name}(${params}) {\n`;
			functionCode += `  log(\"Running '${name}'\");\n`;
			functionCode += `  // TODO: Implement ${name}\n`;
			functionCode += `}\n\n`;
			return functionCode;
		}

		for (const className in parsedData.classes) {
			const rawName = className.replace(/^class\s+/, "");
			const cls = parsedData.classes[ className ];
			const extendsPart = cls.baseClass ? ` extends ${cls.baseClass}` : "";
			outputCode += `class ${rawName}${extendsPart} {\n`;
			outputCode += generateClassConstructor(cls);
			outputCode += generateClassMethods(cls);
			outputCode += `}\n\n`;
		}

		// Generate classes from schemas as well
		for (const schemaName in parsedData.schemas) {
			const schema = parsedData.schemas[ schemaName ];
			const parts = schema.props.map(prop => {
				const defaultVal = prop.default !== null && prop.default !== undefined ? prop.default : 'null';
				return `  ${prop.name}: ${defaultVal}`;
			});

			outputCode += `const ${schemaName} = {\n${parts.join(",\n")}\n};\n\n`;
		}




		for (const func of parsedData.functions) {
			outputCode += generateFunctionCode(func);
		}

		const outputCodeBlock = document.getElementById("output");

// 1. Set generated JS code
outputCodeBlock.textContent = outputCode.trim();

// 2. Manually trigger Prism highlighting
// This line is 100% required for dynamic content
if (window.Prism && typeof Prism.highlightElement === 'function') {
	Prism.highlightElement(outputCodeBlock);
} else {
	console.warn("Prism.js not loaded correctly.");
}

		renderStructureDiagram(parsedData);
		renderMermaidDiagram(parsedData);
	}

*/
	function generateJS() {
		const inputText = document.getElementById("dslInput").value;
		const parsedData = parseDSL(inputText);

		// Semantic wrappers
		function kw(word) { return `<span class="kw">${word}</span>`; }
		function punct(c) { return `<span class="punct">${c}</span>`; }
		function op(op) { return `<span class="op">${op}</span>`; }
		function id(name) { return `<span class="id">${name}</span>`; }
		function prop(name) { return `<span class="prop">${name}</span>`; }
		function lit(value) {
			if (value === "null") return `<span class="lit">null</span>`;
			if (value === "true" || value === true) return `<span class="kw">true</span>`;
			if (value === "false" || value === false) return `<span class="kw">false</span>`;
			if (!isNaN(value) && value !== "") return `<span class="num">${value}</span>`;
			if (typeof value === "string") return `<span class="lit">"${value}"</span>`;
			return `<span class="id">${value}</span>`;
		}
		function comment(text) {
			return `<span class="comment">${text}</span>`;
		}


		function clsName(name) { return `<span class="class">${name}</span>`; }

		function wrapArgsProp(name) {
			return id("args") + punct(".") + prop(name);
		}
		function wrapThisProp(name) {
			return kw("this") + punct(".") + prop(name);
		}

		function isClassTypeLocal(type) {
			return isClassType(type, parsedData.classes);
		}
		function isClassArrayTypeLocal(type) {
			return isClassArrayType(type, parsedData.classes);
		}
		function isSchemaType(type) {
			return parsedData.schemas && Object.prototype.hasOwnProperty.call(parsedData.schemas, type);
		}

		function renderNestedObjectInit(typeProps) {
			const parts = typeProps.map(prop =>
				id(prop.name) + punct(":") + " " + (prop.default !== null ? lit(prop.default) : lit("null"))
			);
			return punct("{") + " " + parts.join(punct(",") + " ") + " " + punct("}");
		}


		function parseMethodSignature(methodSignature) {
			methodSignature = methodSignature.replace(/:\s*\w+\s*(\/\/.*)?$/, "").trim();
			const match = methodSignature.match(/^(\w+)\((.*)\)$/);
			if (!match) return { name: methodSignature, params: "" };
			const name = match[ 1 ];
			const params = match[ 2 ]
				.split(",")
				.map(param => param.trim().split(":")[ 0 ])
				.filter(Boolean)
				.map(id)
				.join(punct(", ") + " ");
			return { name: id(name), params };
		}

		function generateClassConstructor(cls) {
			let constructorCode = "  " + kw("constructor") + punct("(") + id("args") + op("=") + punct("{") + punct("}") + punct(")") + " " + punct("{") + "\n";

			if (cls.baseClass) {
				constructorCode += "    " + kw("super") + punct("(") + id("args") + punct(")") + punct(";") + "\n";
			}

			for (const prop of cls.props) {
				let assignment;
				if (prop.type && parsedData.schemas?.[ prop.type ]) {
					assignment = punct("{") + op("...") + id(prop.type) + punct("}");
				} else if (prop.type === "inlineObject") {
					assignment = renderNestedObjectInit(prop.typeProps);
				} else if (prop.default !== null && prop.default !== undefined) {
					assignment = lit(prop.default);
				} else if (prop.type) {
					if (isClassTypeLocal(prop.type)) {
						assignment = kw("new") + " " + clsName(prop.type) + punct("()");
					} else if (isClassArrayTypeLocal(prop.type)) {
						assignment = punct("[") + punct("]");
					} else if (isSchemaType(prop.type)) {
						assignment = punct("{") + punct("}");
					} else {
						assignment = lit("null");
					}
				} else {
					assignment = lit("null");
				}

				constructorCode +=
					"    " +
					wrapThisProp(prop.name) + " " +
					op("=") + " " +
					wrapArgsProp(prop.name) + " " +
					op("??") + " " +
					assignment + punct(";") + "\n";
			}

			constructorCode += "  " + punct("}") + "\n\n";
			return constructorCode;
		}

		function generateClassMethods(cls) {
			let methodsCode = "";
			for (const methodSignature of cls.methods) {
				const { name, params } = parseMethodSignature(methodSignature);
				methodsCode +=
					"  " +
					name + punct("(") + params + punct(")") + " " + punct("{") + "\n" +
					"    " + kw("log") + punct("(") + lit(`Running '${name.replace(/<[^>]+>/g, "")}'`) + punct(")") + punct(";") + "\n" +
					"    " + kw("// TODO: Implement") + " " + name + "\n" +
					"  " + punct("}") + "\n\n";
			}
			return methodsCode;
		}

		function generateFunctionCode(funcSignature) {
			const { name, params } = parseMethodSignature(funcSignature);
			let functionCode =
				kw("function") + " " +
				name + punct("(") + params + punct(")") + " " + punct("{") + "\n" +
				"  " + kw("log") + punct("(") + lit(`Running '${name.replace(/<[^>]+>/g, "")}'`) + punct(")") + punct(";") + "\n" +
				"  " + kw("// TODO: Implement") + " " + name + "\n" +
				punct("}") + "\n\n";
			return functionCode;
		}

		// Header comment
		let outputCode = kw("// AUTO-GENERATED NAKED SKELETON — meant to be fleshed out step-by-step") + "\n\n";

		outputCode += kw("const") + " " + id("DEBUG") + " " + op("=") + " " + kw("true") + punct(";") + "\n";
		outputCode += kw("function") + " " + id("log") + punct("(") + id("msg") + punct(")") + " " + punct("{") + "\n";
		outputCode += "  " + kw("if") + punct("(") + id("DEBUG") + ") " + kw("console") + punct(".") + kw("log") + punct("(") + id("msg") + punct(")") + punct(";") + "\n";
		outputCode += punct("}") + "\n\n";

		for (const className in parsedData.classes) {
			const rawName = className.replace(/^class\s+/, "");
			const cls = parsedData.classes[ className ];
			const extendsPart = cls.baseClass ? " " + kw("extends") + " " + clsName(cls.baseClass) : "";
			outputCode += kw("class") + " " + clsName(rawName) + extendsPart + " " + punct("{") + "\n";
			outputCode += generateClassConstructor(cls);
			outputCode += generateClassMethods(cls);
			outputCode += punct("}") + "\n\n";
		}

		// Generate schemas as constants
		for (const schemaName in parsedData.schemas) {
			const schema = parsedData.schemas[ schemaName ];
			const parts = schema.props.map(prop => {
				const defaultVal = (prop.default !== null && prop.default !== undefined) ? lit(prop.default) : lit("null");
				return "  " + id(prop.name) + punct(":") + " " + defaultVal;
			});
			outputCode += kw("const") + " " + id(schemaName) + " " + op("=") + " " + punct("{") + "\n" +
				parts.join(punct(",") + "\n") + "\n" + punct("}") + punct(";") + "\n\n";
		}

		for (const func of parsedData.functions) {
			outputCode += generateFunctionCode(func);
		}
		function wrapComments(code) {
			// regex to find comments
			const regex = /\/\/.*$|\/\*[\s\S]*?\*\//gm;
			return code.replace(regex, comment => `<span class="comment">${comment}</span>`);
		}
/*
		let codeWithComments = wrapComments(outputCode);

		// Step 2: Split by comment spans so you isolate comments
		const parts = codeWithComments.split(/(<span class="comment">[\s\S]*?<\/span>)/g);

		// Step 3: Highlight only the non-comment parts
		const highlightedParts = parts.map(part => {
			if (part.startsWith('<span class="comment">')) {
				// This is a comment - return as-is
				return part;
			}
			// Non-comment code - apply your existing highlight here
			return highlightNonCommentCode(part);
		});

		// Step 4: Join everything
		const finalCode = highlightedParts.join('');

*/
		const outputCodeBlock = document.getElementById("output");
		outputCodeBlock.innerHTML = wrapComments(outputCode.trim());


		if (window.Prism && typeof Prism.highlightElement === "function") {
			Prism.highlightElement(outputCodeBlock);
		} else {
			console.warn("Prism.js not loaded correctly.");
		}

		renderStructureDiagram(parsedData);
		renderMermaidDiagram(parsedData);
	}




	function getAllMembers(cls, parsed) {
		// Recursively collect props, methods, parameters from base classes
		let props = [];
		let methods = [];
		let parameters = [];

		if (cls.baseClass) {
			const base = parsed.classes[ cls.baseClass ];
			if (base) {
				const baseMembers = getAllMembers(base, parsed);
				props = baseMembers.props;
				methods = baseMembers.methods;
				parameters = baseMembers.parameters;
			}
		}

		// Combine base + own members (own overrides base)
		const combinedProps = [ ...props, ...cls.props ];
		const combinedMethods = [ ...methods, ...cls.methods ];
		const combinedParameters = [ ...parameters, ...cls.parameters ];

		return {
			props: combinedProps,
			methods: combinedMethods,
			parameters: combinedParameters,
		};
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

		const sectionRenderers = {
			parameters: (items) =>
				items.map(
					(p) =>
						`  ${p.name}: ${p.type || "any"}${p.default ? ` = ${p.default}` : ""}`
				),
			props: (items) => renderProps(items),
			methods: (items) => items.map((m) => `  ${m}`),
		};

		for (const className in parsed.classes) {
			const cls = parsed.classes[ className ];

			const wrapper = document.createElement("div");
			const header = document.createElement("div");
			header.className = "collapsible";
			header.textContent = className + (cls.baseClass ? ` (extends ${cls.baseClass})` : "");

			const content = document.createElement("div");
			content.className = "content";

			const lines = [];

			// Get combined members including inherited
			const combined = getAllMembers(cls, parsed);

			// Render each section with combined members
			for (const section of [ "parameters", "props", "methods" ]) {
				const renderFn = sectionRenderers[ section ];
				const items = combined[ section ] || [];
				lines.push(...renderSection(section, items, renderFn));
				lines.push(""); // blank line between sections
			}

			const pre = document.createElement("pre");
			pre.textContent = lines.join("\n");
			content.appendChild(pre);

			header.addEventListener("click", () => {
				header.classList.toggle("active");
				content.classList.toggle("active");
			});

			wrapper.appendChild(header);
			wrapper.appendChild(content);
			container.appendChild(wrapper);
		}

		// Render schemas
		for (const schemaName in parsed.schemas) {
			const schema = parsed.schemas[ schemaName ];

			const wrapper = document.createElement("div");
			const header = document.createElement("div");
			header.className = "collapsible";
			header.textContent = schemaName + " (schema)";

			const content = document.createElement("div");
			content.className = "content";

			const lines = [];
			lines.push("props:");
			if (schema.props.length) {
				schema.props.forEach(p => {
					lines.push(`  ${p.name}: ${p.type || "any"}${p.default ? ` = ${p.default}` : ""}`);
				});
			} else {
				lines.push("  (none)");
			}
			lines.push("");

			const pre = document.createElement("pre");
			pre.textContent = lines.join("\n");
			content.appendChild(pre);

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

		/*
		// Recursively get inherited props and methods
		function getInheritedMembers(clsName, parsed) {
			const cls = parsed.classes[clsName];
			if (!cls || !cls.baseClass) return { props: [], methods: [] };
			const base = parsed.classes[cls.baseClass];
			if (!base) return { props: [], methods: [] };
			const baseInherited = getInheritedMembers(cls.baseClass, parsed);
			return {
				props: [...base.props, ...baseInherited.props],
				methods: [...base.methods, ...baseInherited.methods],
			};
		}
		*/

		// Render constructor signature line(s)
		function renderConstructor(cls) {
			if (cls.parameters && cls.parameters.length > 0) {
				const params = cls.parameters.map((p) => p.name).join(", ");
				return [ `+constructor(${sanitize(params)})` ];
			}
			return [ "+constructor()" ];
		}

		// Render all props lines for a class
		function renderProps(cls /*, inheritedProps = [] */) {
			return cls.props.map(
				(prop) =>
					`+${prop.name}: ${sanitize(prop.type || "any")}${prop.default !== null && prop.default !== undefined
						? ` = ${sanitize(prop.default)}`
						: ""
					}`
			);
			/*
			.concat(
				inheritedProps.map(
					(p) =>
						`+${sanitize(p.name)}: ${sanitize(p.type || "any")} [i*]`
				)
			);
			*/
		}

		// Render all method lines for a class
		function renderMethods(cls /*, inheritedMethods = [] */) {
			const renderMethodLine = (method) => {
				// Strip return type part after closing parenthesis, e.g. ": boolean"
				let signatureOnly = method.replace(/:\s*[^)]*$/, "").trim();

				let methodName = signatureOnly;
				let params = "";
				const m = signatureOnly.match(/^(\w+)\((.*)\)$/);
				if (m) {
					methodName = m[ 1 ];
					params = m[ 2 ]
						.split(",")
						.map((p) => p.trim().split(":")[ 0 ])
						.filter(Boolean)
						.join(", ");
				}
				return `+${sanitize(methodName)}(${sanitize(params)})`;
			};
			return cls.methods
				.map(renderMethodLine);
			/*
			.concat(
			  inheritedMethods.map((m) => `${renderMethodLine(m)} [i*]`)
			);
			*/
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


		// Add inheritance relation
		function addInheritanceRelation(className, baseClass) {
			const relKey = `${className}->${baseClass}_inherits`;
			if (!relationsSet.has(relKey)) {
				lines.push(`${baseClass} <|-- ${className}`);
				relationsSet.add(relKey);
			}
		}


		for (const className in parsed.classes) {
			const cls = parsed.classes[ className ];


			// Add inheritance arrow if baseClass exists
			if (cls.baseClass && isClassType(cls.baseClass)) {
				addInheritanceRelation(className, cls.baseClass);
			}
/*
			// Get inherited members
			const inherited = getInheritedMembers(className, parsed);
			*/

			const classBodyLines = [
				...renderConstructor(cls),
				...renderProps(cls /*, inherited.props */),
				...renderMethods(cls /*, inherited.methods */),
			];

			lines.push(`class ${className} {\n  ${classBodyLines.join("\n  ")}\n}`);

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
						label = `has-one (selected from ${collections[ prop.type ]})`;
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
				this.value = this.value.substring(0, start) + "\t" + this.value.substring(end);
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
			"```bash",
			dslInput,
			"```",
			"\n# Generated JS\n",
			"```js",
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