import json

with open('students.json') as f:
    students = json.load(f)
    
for student in students:
    print(f"Name: {student['name']}, Grade: {student['grade']}")
