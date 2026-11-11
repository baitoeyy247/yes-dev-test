# แผนการทำงานพัฒนาระบบ QR สินค้า Luma Skin

## 1. Flow การทำงาน

1. Super Admin เข้าสู่ระบบ
2. Super Admin สามารถส่งคำเชิญอีเมลให้ Admin ใหม่ ระบบบันทึกอีเมลลง log
3. Admin อัปโหลดไฟล์สินค้า ระบบตรวจสอบความถูกต้องของข้อมูล
4. สร้างข้อมูลสินค้าและสร้าง QR Code ให้สินค้าแต่ละชิ้น
5. ลูกค้าสแกน QR Code บนสินค้า แล้วเห็นหน้าเว็บข้อมูลสินค้า
6. ทดสอบการนำเข้าไฟล์สินค้า เพื่อทดสอบการอัปเดตข้อมูลสินค้าเดิมและเพิ่มสินค้าใหม่

## 2. โครงสร้างฐานข้อมูล

- เก็บข้อมูลผู้ดูแลระบบ
  - id (PK)
  - name (string)
  - email (string)
  - password (string, เก็บเป็นค่าแฮช)
  - role (Enum `Super Admin`, `Admin`)
- เก็บข้อมูลสินค้า
  - id (PK)
  - sku (string, ตัวอย่างรูปแบบ LS-0000 แต่ไม่ล็อกรูปแบบ)
  - name (string)
  - category (string: Cleanser, Toner, Serum, Moisturizer, Sunscreen หรือ Mask)
  - price (decimal, มากกว่า 0)
  - size (string)
  - description (string)
  - how_to_use (string)
  - status (string `active` หรือ `inactive`, ถ้าว่างให้เป็น `active`)
- เก็บสถิติการสแกน QR Code
  - id (PK)
  - product_id (FK)
  - scanned_at (timestamp)
  - ip_address (string)
  - user_agent (text)

ฟิลด์เสริมที่ฟีเจอร์ในสเปกต้องใช้: `public_code` สำหรับลิงก์ QR ที่ไม่เปลี่ยนเมื่อแก้ข้อมูล, `image_path` สำหรับรูปสินค้า, ตารางคำเชิญ และตารางบันทึกอีเมล

## 3. ลำดับงาน

- เขียน PLAN.md
- เซ็ตอัพโปรเจกต์ ฐานข้อมูล seed Super Admin และทำระบบ login
- พัฒนาระบบ Import Excel, ระบบจัดการสินค้า และสร้าง QR Code
- ทำหน้าเว็บสินค้า ระบบบันทึก log การสแกน และทดสอบการอัปเดตไฟล์
- ทดสอบภาพรวมระบบ
