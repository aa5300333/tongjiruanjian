
const input = "29：10：02：08：34：26：20各20米。港41：46各10米";
const moKeywords = ['新澳门', '澳门', '新', '门', '澳'];
const hkKeywords = ['香港', '香', '港'];
const allKeywords = [...moKeywords, ...hkKeywords].sort((a, b) => b.length - a.length);

const occurrences = [];
allKeywords.forEach(kw => {
    let pos = input.indexOf(kw);
    while (pos !== -1) {
        occurrences.push({ 
            type: (hkKeywords.includes(kw)) ? 'HK' : 'MO', 
            index: pos, 
            length: kw.length,
            text: kw
        });
        pos = input.indexOf(kw, pos + 1);
    }
});

occurrences.sort((a, b) => a.index - b.index);

const filteredOccurrences = [];
let lastEnd = -1;
occurrences.forEach(occ => {
    if (occ.index >= lastEnd) {
        filteredOccurrences.push(occ);
        lastEnd = occ.index + occ.length;
    }
});

const hasAnyMo = filteredOccurrences.some(o => o.type === 'MO');
const hasAnyHk = filteredOccurrences.some(o => o.type === 'HK');

console.log("Input:", input);
console.log("Filtered Occurrences:", filteredOccurrences);
console.log("hasAnyMo:", hasAnyMo);
console.log("hasAnyHk:", hasAnyHk);

if (hasAnyHk && !hasAnyMo) {
    console.log("Result: HK ONLY");
} else if (hasAnyMo && !hasAnyHk) {
    console.log("Result: MO ONLY");
} else {
    console.log("Result: MIXED or NONE");
}
