const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'preview', 'page.tsx');

// 读取文件
let content = fs.readFileSync(filePath, 'utf8');

// 查找并替换
const oldPattern = /chainId=\{TARGET_CHAIN_ID\}\s*\/>/;
const newCode = `chainId={TARGET_CHAIN_ID}
          gasEstimate={gasEstimate}
        />`;

if (oldPattern.test(content)) {
  content = content.replace(oldPattern, newCode);
  
  // 写回文件（UTF-8 编码）
  fs.writeFileSync(filePath, content, 'utf8');
  
  console.log('✅ Successfully added gasEstimate prop!');
  console.log('📝 File saved with UTF-8 encoding');
} else {
  console.log('❌ Pattern not found. File may have been modified.');
  console.log('🔍 Searching for SwapPreviewCard...');
  
  if (content.includes('SwapPreviewCard')) {
    console.log('✅ SwapPreviewCard found in file');
    console.log('⚠️  But the expected pattern was not matched');
  }
}
