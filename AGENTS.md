# Project Specific Instructions & Memory Bank

## Lottery Parsing Rules (Regressions to Avoid)

- **Tail Numbers (X尾)**: When the input contains "X尾" (e.g., "0尾", "1尾"), it should be expanded to all numbers ending in X (1-49).
    - Example: "0尾各30" -> Numbers: [10, 20, 30, 40], Amount: 30.
    - Example: "1尾各20" -> Numbers: [1, 11, 21, 31, 41], Amount: 20.
- **Range Numbers (X到Y)**: When the input contains "X到Y" (e.g., "1到5"), it should be expanded to all numbers from X to Y inclusive.
    - Example: "1到5各10" -> Numbers: [1, 2, 3, 4, 5], Amount: 10.
    - Example: "10到15各50" -> Numbers: [10, 11, 12, 13, 14, 15], Amount: 50.

## Design Preferences
- Maintain a clean, professional financial interface.
- **UI Style**: Avoid neubrutalism (no heavy black shadows). Use clean borders and subtle backgrounds.
- **Number Matrix**: 
    - 5-column layout.
    - 49 is at the top-right (Row 1, Column 5).
    - Amount display boxes must have fixed dimensions (e.g., `w-18 h-6`) and not change size with content.
    - Initial values are blank (empty string), not '0'.
    - Labels: "Total Turnover" changed to "总和".
- **Input Parsing**:
    - Numbers in the "Parse Preview" should be separated by spaces (e.g., `01 02 03`).
    - Spaces between non-digit characters (like zodiacs) should be removed (e.g., `猪狗`).
- **Risk Analysis**: Use light gray dividers (`border-gray-100`) and compact row heights (~17px) for high density.
- **Parsing Categories**:
    - **家禽/家肖/家**: 牛马羊鸡狗猪 (Standard name: 家禽)
    - **野肖/野兽/野**: 鼠虎兔龙蛇猴 (Standard name: 野肖)
- **Recent History**: The main interface's "Recent History" (最近流水) shows only the last 10 records. A "View All" button opens a modal to see all history.
- **Excel Export**: 
    - Columns: [原数据, 识别后的数据, 下注金额, 用户中奖金额, 赔付金额（未扣水）].
    - Hidden comments (red triangle only) for raw data on the third column (Bet Amount).
- **Calculations**: Match the UI "Winning Amount" (single stake winning).
