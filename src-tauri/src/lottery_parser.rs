use serde::{Deserialize, Serialize};
use regex::Regex;
use std::collections::HashMap;
use lazy_static::lazy_static;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParseResult {
    pub numbers: Vec<i32>,
    pub amount: f64,
    pub raw: String,
    pub r#type: String, // 'single' | '三中三' | '二中二' | '特碰'
    pub banker: Option<i32>,
}

lazy_static! {
    static ref ZODIAC_LIST: Vec<&'static str> = vec!["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"];
    
    static ref COLOR_MAP: HashMap<&'static str, Vec<i32>> = {
        let mut m = HashMap::new();
        m.insert("红", vec![1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
        m.insert("蓝", vec![3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);
        m.insert("绿", vec![5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]);
        m
    };

    static ref TYPO_MAP: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("兰", "蓝"); m.insert("蘭", "蓝");
        m.insert("园", "元"); m.insert("毎", "每");
        m.insert("個", "个"); m.insert("龍", "龙");
        m.insert("馬", "马"); m.insert("雞", "鸡");
        m.insert("豬", "猪");
        m
    };
    
    static ref STRONG_KEYWORDS: Vec<&'static str> = vec![
        "一个字", "每个字", "各一个字", "一粒", "各数", "各自", "各号", "各字", "个字", "每个号", 
        "各一个号", "一个号", "每号", "个号", "每个", "各粒", "一个", "各", "包", "粒", "各位", 
        "个", "字", "一字", "每", "打", "买", "下", "位", "压", "快", "￥", "=", "＝"
    ];
}

pub fn get_numbers_by_zodiac(zodiac: &str) -> Vec<i32> {
    let index = ZODIAC_LIST.iter().position(|&x| x == zodiac);
    match index {
        Some(idx) => {
            let mut numbers = Vec::new();
            for i in 1..=49 {
                if (i - 1) % 12 == idx as i32 {
                    numbers.push(i);
                }
            }
            numbers
        },
        None => Vec::new(),
    }
}

pub fn correct_typos(text: &str) -> String {
    let mut corrected = text.to_string();
    for (typo, correct) in TYPO_MAP.iter() {
        corrected = corrected.replace(typo, correct);
    }
    corrected
}

pub fn replace_chinese(text: &str) -> String {
    // Simplified version for the example, focusing on 0-10
    let mut res = text.to_string();
    let char_map: HashMap<char, &str> = [
        ('零', "0"), ('一', "1"), ('二', "2"), ('三', "3"), ('四', "4"), 
        ('五', "5"), ('六', "6"), ('七', "7"), ('八', "8"), ('九', "9"), ('十', "10")
    ].iter().cloned().collect();

    for (c, s) in char_map {
        res = res.replace(&c.to_string(), s);
    }
    res
}

// In a real migration, we'd implement the full complex parsing logic here.
// For brevity, this is a placeholder that demonstrates the structure.
pub fn parse_input_rust(input: &str) -> Vec<ParseResult> {
    let mut results = Vec::new();
    let cleaned = correct_typos(input);
    let normalized = replace_chinese(&cleaned);
    
    // Example: parse something simple like "01 02 各 100"
    let re = Regex::new(r"([\d\s]+)各\s*(\d+)").unwrap();
    for cap in re.captures_iter(&normalized) {
        let nums_str = &cap[1];
        let amount_str = &cap[2];
        
        let numbers: Vec<i32> = nums_str
            .split_whitespace()
            .filter_map(|s| s.parse::<i32>().ok())
            .filter(|&n| n >= 1 && n <= 49)
            .collect();
            
        let amount = amount_str.parse::<f64>().unwrap_or(0.0);
        
        if !numbers.is_empty() && amount > 0.0 {
            results.push(ParseResult {
                numbers,
                amount,
                raw: cap[0].to_string(),
                r#type: "single".to_string(),
                banker: None,
            });
        }
    }
    
    results
}
