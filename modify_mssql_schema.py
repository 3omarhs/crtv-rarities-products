
import pyodbc

CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

def modify_schema():
    try:
        conn = pyodbc.connect(CONN_STR)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # 1. Check for NULL item_no
        cursor.execute("SELECT count(*) FROM products WHERE item_no IS NULL")
        cnt = cursor.fetchone()[0]
        if cnt > 0:
            print(f"Error: Found {cnt} rows with NULL item_no. Cannot make it PK.")
            # Optional: Delete them?
            # cursor.execute("DELETE FROM products WHERE item_no IS NULL")
            # print("Deleted NULL item_no rows.")
            return

        print("1. Dropping existing constraints...")
        # Find PK constraint name
        cursor.execute("SELECT name FROM sys.key_constraints WHERE type = 'PK' AND parent_object_id = OBJECT_ID('products')")
        row = cursor.fetchone()
        if row:
            pk_name = row[0]
            print(f"   Dropping PK: {pk_name}")
            cursor.execute(f"ALTER TABLE products DROP CONSTRAINT {pk_name}")
            
        # Find Unique constraints
        cursor.execute("SELECT name FROM sys.key_constraints WHERE type = 'UQ' AND parent_object_id = OBJECT_ID('products')")
        rows = cursor.fetchall()
        for row in rows:
            uq_name = row[0]
            print(f"   Dropping UQ: {uq_name}")
            cursor.execute(f"ALTER TABLE products DROP CONSTRAINT {uq_name}")

        print("2. Dropping 'id' column...")
        try:
             cursor.execute("ALTER TABLE products DROP COLUMN id")
        except Exception as e:
            print(f"   (Info) Could not drop id (maybe already gone): {e}")

        print("3. Altering 'item_no' to NOT NULL...")
        # Assuming max length 255 is safe
        cursor.execute("ALTER TABLE products ALTER COLUMN item_no NVARCHAR(255) NOT NULL")

        print("4. Adding Primary Key on 'item_no'...")
        cursor.execute("ALTER TABLE products ADD CONSTRAINT PK_products_item_no PRIMARY KEY (item_no)")
        
        print("Schema modification complete.")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    modify_schema()
