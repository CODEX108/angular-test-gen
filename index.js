#! /usr/bin/env node
import { parse } from "@babel/parser";
import { traverse } from "@babel/core";
import inquirer from "inquirer";
import gradient from "gradient-string";
import chalk from "chalk";
import { readFileSync, writeFile } from "fs";
import * as ejs from "ejs";
import path from "path";
import * as prettier from "prettier";

function generateTest(filepath) {
  const code = readFileSync(filepath, "utf-8", (err, data) => {
    if (err) {
      console.log(err);
    }
    return data.toString();
  });

  let className = "";
  let fnNames = [];
  let spyList = [];
  let importList = [];
  let multiImportList = [];
  let declareSpyList = [];
  let classImport;

  const ast = parse(code, {
    plugins: ["typescript", "decorators", "throwExpressions"],
    sourceType: "module",
  });

  try {
    traverse(ast, {
      ClassDeclaration(path) {
        if (path.node.type === "ClassDeclaration") {
          className = path.node.id.name;
          const pathArray = filepath.split("/");
          const filePathLength = pathArray.length;
          const source = pathArray[filePathLength - 1].replace(".ts", "");
          classImport = {
            import: className,
            source: `./${source}`,
          };
        }
      },
    });
    traverse(ast, {
      ClassMethod(path) {
        if (
          path.node.type === "ClassMethod" &&
          path.node.kind !== "get" &&
          path.node.kind !== "set" &&
          path.node.kind !== "constructor"
        ) {
          if (!path.node.key.name.includes("ng")) {
            fnNames.push(path.node.key.name);
          }
        }

        if (
          path.node.type === "ClassMethod" &&
          path.node.kind === "constructor"
        ) {
          path.node.params.forEach((param) => {
            if (param.parameter?.typeAnnotation?.typeAnnotation) {
              spyList.push(
                param.parameter.typeAnnotation.typeAnnotation.typeName.name
              );
            }
          });
          path.node.params.forEach((param) => {
            if (
              param.parameter?.name &&
              param.parameter?.typeAnnotation?.typeAnnotation
            ) {
              declareSpyList.push({
                var: param.parameter.name,
                type: param.parameter.typeAnnotation.typeAnnotation.typeName
                  .name,
              });
            }
          });
        }
      },
      ImportDeclaration(path) {
        if (path.node.type === "ImportDeclaration") {
          const sourcePath = path.node.source.value;
          if (path.isAbsolute(path.node.source.value)) {
            const relativePath = path.relative(path.dirname(filepath), sourcePath);
            path.node.source.value = `./${relativePath}`;
          }
          if (path.node.specifiers.length === 1) {
            importList.push({
              import: path.node.specifiers[0].local.name,
              source: path.node.source.value.trim(),
            });
          } else {
            let imports = [];
            path.node.specifiers.forEach((spec) => {
              imports.push(spec.imported.name);
            });
            multiImportList.push({
              import: imports,
              source: path.node.source.value,
            });
          }
        }
      },
    });
  } catch (error) {
    console.log(error);
  }

  let newImportList = importList.filter((imp) => spyList.includes(imp.import));

  newImportList.push(classImport);
  const newMImpList = multiImportList
    .map((mImp) => {
      const newImp = mImp.import.filter((m) => spyList.includes(m));
      return {
        ...mImp,
        import: newImp,
      };
    })
    .filter((mImp) => mImp.import.length > 0);
  const template = path.join("./templates/test-component.ejs");
  const data = {
    fnNames: fnNames,
    className: className,
    importList: newImportList,
    multiList: newMImpList,
    declareSpyList: declareSpyList,
  };

  ejs.renderFile(template, data, {}, (err, data) => {
    if (err) {
      console.log(err);
    }

    if (data) {
      const formatted = prettier.format(data, {
        parser: "typescript",
      });

      writeFile(filepath.replace(".ts", ".spec.ts"), formatted, (err) => {
        if (err) {
          console.log(err);
        }
        console.log(chalk.bgGreen("File written successfully"));
      });
    }
  });
}

function main() {
  console.log(gradient("orange", "yellow", "red")("Angular Tests Generator"));
  inquirer
    .prompt([
      {
        name: "filepath",
        message: "What is the absolute path to the file?",
        type: "input",
      },
    ])
    .then((answers) => {
      generateTest(answers.filepath);
    })
    .catch((err) => {
      if (err) {
        console.log(chalk.bgRed(err.message));
      }
    });
}

main();
