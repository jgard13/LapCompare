import db_connection
import json

try:
    conn = db_connection.get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM computadora WHERE tienda = 'eBay' LIMIT 5")
    columns = [desc[0] for desc in cur.description]
    rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    
    # Format numeric for JSON
    for row in rows:
        for k, v in row.items():
            if hasattr(v, '__str__') and not isinstance(v, (str, int, float, bool, type(None))):
                row[k] = str(v)
                
    print(json.dumps(rows, indent=2, ensure_ascii=False))
    conn.close()
except Exception as e:
    print(f"Error: {e}")
