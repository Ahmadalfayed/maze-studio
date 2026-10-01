# استوديو المتاهات (Maze Studio)
مولّد متاهات احترافي يعمل دون إنترنت — افتح `index.html` مباشرة في المتصفح (أو عبر أي خادم ملفات ثابتة).

- الأشكال: مربعة، دائرية، سداسية، مثلثية، منسوجة (جسور)، وأشكال مخصّصة بالقناع: قلب، نجمة، دائرة، معيّن، سداسي، هلال، نص عربي/لاتيني، صورة مرفوعة.
- الخوارزميات: DFS، Prim، Kruskal، Wilson، Hunt & Kill (كل الأشكال والأقنعة) + Eller، Binary Tree، Sidewinder، Recursive Division (المربعة الكاملة) — المنسوجة: Kruskal.
- بذرة قابلة للتعديل، حل BFS متحرك، وضع لعب (أسهم/WASD/سحب)، تصدير PNG/SVG وطباعة/PDF وكتاب متاهات.

الملفات: `js/rng.js` • `js/masks.js` (الأقنعة) • `js/grids.js` (الأشكال) • `js/algorithms.js` • `js/maze.js` • `js/render.js` • `js/play.js` • `js/export.js` • `js/app.js` • `css/style.css` • `css/font.css` (خط Cairo مضمَّن، رخصة OFL في `fonts/OFL.txt`).

## النشر كموقع عام (Deploy)
المجلد موقع ثابت جاهز (لا يحتاج بناء). أي من الخيارات التالية يتطلب حساباً مجانياً لدى المزوّد:
- **Netlify Drop**: افتح https://app.netlify.com/drop واسحب المجلد (أو `maze-studio-site.zip`).
- **Cloudflare Pages**: Workers & Pages ← Create ← Pages ← Upload assets ← ارفع المجلد/الملف المضغوط.
- **GitHub Pages**: أنشئ مستودعاً وارفع محتوى المجلد إلى الفرع `main`، ثم Settings ← Pages ← Deploy from branch (ملف `.nojekyll` موجود).
- **Surge**: `npx surge ./maze-studio your-name.surge.sh` (يطلب تسجيل بريد وكلمة مرور).
