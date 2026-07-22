import docx

def cleanup_docx():
    doc_path = '/home/naantuam/Documents/Template for the Entire Project.docx'
    doc = docx.Document(doc_path)
    body = doc.element.body

    elements_to_remove = []

    for idx, child in enumerate(list(body)):
        tag = child.tag.split('}')[-1]
        if tag == 'tbl':
            tbl_text = ''.join([node.text for node in child.iter() if node.tag.endswith('t') and node.text])
            # If this table is the stray Table 3.5 sitting right before CHAPTER THREE
            if 'Tactical Domain' in tbl_text and idx < 320:
                print(f"Found misplaced table at element index {idx}: {tbl_text[:60]}")
                elements_to_remove.append(child)

    for el in elements_to_remove:
        body.remove(el)

    doc.save(doc_path)
    print("Cleaned up misplaced table successfully!")

if __name__ == '__main__':
    cleanup_docx()
