define(function (require) {
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var JSZip = require('jszip');
  var CourseModel = require('core/models/courseModel');
  var Schemas = require('../../scaffold/schemas');
  var ContentObjectModel = require('core/models/contentObjectModel');
  var ArticleModel = require('core/models/articleModel');
  var BlockModel = require('core/models/blockModel');
  var ComponentModel = require('core/models/componentModel');
  var ComponentTypeModel = require('core/models/componentTypeModel');

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
        var course = new CourseModel();
        var type = "course";
        var schema = new Schemas(type);
        var options = {model: course};
        course.schema = Origin.scaffold.buildSchema(schema, options);
        course.schema.title.default = 'Ppt Import';
        course.schema.displayTitle.default = 'Ppt Import';
        course.save(null, {
          patch: false,
          success:  () => console.log("Success"),
          error: () => console.log("Failed")
        });
        window.console.log(course);
        const parsedSlides = [];

        reader.onload = async (e) => {
          try {
            const zip = await JSZip.loadAsync(e.target.result);
            let xmlOutput = '';
            let index = 0;

            // Collect promises for all slide processing
            const promises = [];

            zip.forEach((relativePath, file) => {
              if (relativePath.startsWith('ppt/slides/') && relativePath.endsWith('.xml')) {
                const promise = file.async('text').then(async (content) => {
                  xmlOutput += `<h3>${relativePath}</h3><pre>${this.escapeHTML(content)}</pre>`;
                  const result = await this.renderXML(content, xmlOutput, file, zip);
                  parsedSlides.push(result);
                });

                promises.push(promise);
              }
            });

            await Promise.all(promises);

            console.log(parsedSlides);
            parsedSlides.forEach((value, index) => {
              this.createGenericPage(course);
            })

          }  catch (error) {
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

      let title = '';
      const bullets = [];
      const pictures = [];
      const pictureBlobs = [];
      const shapes = xmlDoc.getElementsByTagNameNS(presentationMLNS, "sp");

      for (let shape of shapes) {
        const nvPr = shape.getElementsByTagNameNS(presentationMLNS, "nvPr")[0];
        const ph = nvPr ? nvPr.getElementsByTagNameNS(presentationMLNS, "ph")[0] : null;
        const isTitle = ph
          && (ph.getAttribute("type") === "title" || ph.getAttribute("type") === "ctrTitle");

        const txBody = shape.getElementsByTagNameNS(presentationMLNS, "txBody")[0];
        if (txBody) {
          const paragraphs = txBody.getElementsByTagNameNS(drawingMLNS, "p");
          for (let paragraph of paragraphs) {
            let textContent = "";
            const textRuns = paragraph.getElementsByTagNameNS(drawingMLNS, "t");
            for (let textRun of textRuns) {
              textContent += textRun.textContent;
            }
            if (textContent.trim()) {
              if (isTitle) {
                title = textContent.trim();
              } else {
                bullets.push(textContent.trim());
              }
            }
          }
        }
      }

      console.log("Title:", title);
      console.log("Bullets:", bullets);

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

      // Collect promises for all picture processing
      const promises = pictures.map(async (picture) => {
        const pictureRel = picture.slide.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        if (zip.files[pictureRel]) {
          const relContent = await zip.file(pictureRel).async('text');
          const relDoc = new DOMParser().parseFromString(relContent, "application/xml");
          const rel = Array.from(relDoc.getElementsByTagName("Relationship"))
            .find((r) => r.getAttribute("Id") === picture.embedId);

          if (rel) {
            const imageName = this.getLastPart(rel.getAttribute("Target"));
            const mediaPath = `ppt/media/${imageName}`;
            const imageBlob = await zip.file(mediaPath).async('blob');
            pictureBlobs.push(imageBlob);

            // Download image
            const link = document.createElement('a');
            link.href = URL.createObjectURL(imageBlob);
            link.download = mediaPath.split('/').pop();
            link.click();
          }
        }
      });

      // Wait for all picture processing to complete
      await Promise.all(promises);

      return {title, bullets, pictureBlobs};
    },

    createGenericPage: function(courseModel) {
      var contentObjectModel = new ContentObjectModel({
        _type: 'page',
        _courseId: courseModel.get('_id'),
        _parentId: courseModel.get('_id')
      });
      contentObjectModel.save(null, {
        error: () => window.console.log("Error"),
        success: _.bind(this.createGenericArticle, this)
      });
    },

    createGenericArticle: function(pageModel) {
      var articleModel = new ArticleModel({
        _courseId: pageModel.get('_courseId'),
        _parentId: pageModel.get('_id'),
        _type: 'article'
      });
      articleModel.save(null, {
        error: () => window.console.log("Error"),
        success: _.bind(this.createGenericBlock, this)
      });
    },

    createGenericBlock: function(articleModel) {
      var blockModel = new BlockModel({
        _courseId: articleModel.get('_courseId'),
        _parentId: articleModel.get('_id'),
        _type: 'block',
        layoutOptions: [
          { type: 'left', name: 'app.layoutleft', pasteZoneRenderOrder: 2 },
          { type: 'full', name: 'app.layoutfull', pasteZoneRenderOrder: 1 },
          { type: 'right', name: 'app.layoutright', pasteZoneRenderOrder: 3 }
        ]
      });
      blockModel.save(null, {
        error: () => window.console.log("Error"),
        success: _.bind(this.createGenericComponent, this)
      });
    },

    createGenericComponent: function(blockModel) {
      // Store the component types
      var componentTypes = new EditorCollection(null, {
        model: ComponentTypeModel,
        url: 'api/componenttype',
        _type: 'componentTypes'
      });
      componentTypes.fetch({
        error: () => window.console.log("Error"),
        success: _.bind(function() {
          var componentModel = new ComponentModel({
            _courseId: blockModel.get('_courseId'),
            _parentId: blockModel.get('_id'),
            body: Origin.l10n.t('app.projectcontentbody'),
            _type: 'component',
            _component: 'text',
            _componentType: componentTypes.findWhere({ component: 'text' }).attributes._id,
            _layout: 'full'
          });
          componentModel.save(null, {
            error: _.bind(this.onSaveError, this),
            success: function() {
              Origin.router.navigateTo('editor/' + componentModel.get('_courseId') + '/menu');
            }
          });
        }, this)
      });
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
