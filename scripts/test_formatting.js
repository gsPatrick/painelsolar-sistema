
const inputs = [
    "Hello\\nWorld",
    "Line 1\\r\\nLine 2",
    "Text with spaces    preserved",
    "String with \\n multiple \\n newlines",
    "Normal text"
];

function processMessage(message) {
    let finalMessage = String(message || '');
    finalMessage = finalMessage
        .replace(/\\r\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\\n/g, '\n');
    finalMessage = finalMessage.trim();
    return finalMessage;
}

console.log("--- TEST REPORT ---");
inputs.forEach(input => {
    const output = processMessage(input);
    console.log(`Input: "${input}"`);
    console.log(`Output: "${output.replace(/\n/g, '[NEWLINE]')}"`); // Visualize newline
    console.log("-------------------");
});
