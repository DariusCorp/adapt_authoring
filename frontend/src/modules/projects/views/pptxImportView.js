define(function (require) {
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var JSZip = require('jszip');

  return OriginView.extend({
    tagName: 'div',
    className: 'pptxImport',

    events: {
      'change .asset-file': 'onFileUpload',
    },

    templateContext: function () {
      return {};
    },

    onFileUpload: function (event) {
      const fileInput = event.target.files[0];
      if (fileInput && fileInput.name.endsWith('.pptx')) {
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const zip = await JSZip.loadAsync(e.target.result);
            let xmlOutput = '';

            // Extract XML files and display content
            zip.forEach((relativePath, file) => {
              if (relativePath.startsWith('ppt/slides/') && relativePath.endsWith('.xml')) {
                file.async('text').then((content) => {
                  xmlOutput += `<h3>${relativePath}</h3><pre>${this.escapeHTML(content)}</pre>`;
                  this.renderXML(content, xmlOutput, file, zip);
                });
              }
            });
          } catch (error) {
            console.error('Error unzipping PPTX file:', error);
            this.renderXML('<p>Error processing file. Please try again.</p>');
          }
        };

        reader.readAsArrayBuffer(fileInput);
      } else {
        alert('Please upload a valid .pptx file');
      }
    },

    renderXML: async function (xmlContent, xmlString, slideFile, zip) {
      const outputElement = document.querySelector('.progress-container');
      outputElement.innerHTML = xmlString;

      // Parse the XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

      const drawingMLNS = "http://schemas.openxmlformats.org/drawingml/2006/main";
      const presentationMLNS = "http://schemas.openxmlformats.org/presentationml/2006/main";

      const bullets = [];
      const pictures = [];
      const shapes = xmlDoc.getElementsByTagNameNS(presentationMLNS, "sp");

      for (let shape of shapes) {
        const txBody = shape.getElementsByTagNameNS(presentationMLNS, "txBody")[0];
        if (txBody) {
          const paragraphs = txBody.getElementsByTagNameNS(drawingMLNS, "p");
          for (let paragraph of paragraphs) {
            let bulletText = "";
            const textRuns = paragraph.getElementsByTagNameNS(drawingMLNS, "t");
            for (let textRun of textRuns) {
              bulletText += textRun.textContent;
            }
            if (bulletText.trim()) {
              bullets.push(bulletText.trim());
            }
          }
        }
      }

      const pics = xmlDoc.getElementsByTagNameNS(presentationMLNS, "pic");
      for (let pic of pics) {
        const blip = pic.getElementsByTagNameNS(drawingMLNS, "blip")[0];
        if (blip) {
          const embedId = blip.getAttribute("r:embed");
          pictures.push({slide: slideFile.name, embedId});
        }
      }

      console.log("Extracted Bullets:", bullets);
      console.log("Extracted Pictures:", pictures);

      for (const picture of pictures) {
        const pictureRel = picture.slide.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        if (zip.files[pictureRel]) {
          const relContent = await zip.file(pictureRel).async('text');
          debugger;
          const relDoc = new DOMParser().parseFromString(relContent, "application/xml");
          const rel = Array.from(relDoc.getElementsByTagName("Relationship"))
            .find((r) => r.getAttribute("Id") === picture.embedId);

          if (rel) {
            const imageName = this.getLastPart(rel.getAttribute("Target"));
            const mediaPath = `ppt/media/${imageName}`;
            const imageBlob = await zip.file(mediaPath).async('blob');

            // Download image
            const link = document.createElement('a');
            link.href = URL.createObjectURL(imageBlob);
            link.download = mediaPath.split('/').pop();
            link.click();
          }
        }
      }
    },

    getLastPart(path) {
      const parts = path.split('/');
      return parts[parts.length - 1];
    },

    escapeHTML: function (unsafe) {
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
  }, {
    template: 'pptxImport',
  });
});
