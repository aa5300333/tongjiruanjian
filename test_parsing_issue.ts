import { parseInput } from './src/utils/lotteryParser';

const input = '2.26. 各15“13=5';
const results = parseInput(input);
console.log(JSON.stringify(results, null, 2));
