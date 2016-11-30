import { ApplicationConfig } from 'base-rest-service/build/Config/ApplicationConfig';
import { UserRepository, AddUserCommand, ChangeUserRolesCommand } from '../Model/UserRepository';
import { RepositoryQueryCommand } from 'base-mongodb-repository/build/RepositoryQuery';
import { RepositoryQueryResult } from 'base-mongodb-repository/build/RepositoryQueryResult';
import * as mongoose from 'mongoose';

let config:ApplicationConfig = new ApplicationConfig();
let userRepository = new UserRepository();

// connects to db before defining UserSchema
mongoose.connect(config.GetDatabaseConnectionString())
    .then(
        () => {
            console.log(`Database: ${config.GetDatabaseConnectionString()}`);
            console.log('DB connection  succeeded');

            // check if at least one admin  exists
            userRepository.Find(new RepositoryQueryCommand("roles={$in:['admin']}"))
                .then((result) => {
                    if (result.found == 0){ // no admin found in collection
                        let newUserCmd = new AddUserCommand('admin', 'admin', 'admin', 'admin@example.com');
                        newUserCmd.entity.roles.push("admin");

                        userRepository.Add(newUserCmd)
                            .then((user) => {
                                console.log(`User ${user.username} created.`);
                                })
                            .catch((error) => console.error(error)) ;
                    }
                    else {
                        console.warn(`There is already one admin. Nothing to do.`);
                    }
                } )
                .catch((error) => console.error(error));           
            
        }, 
        (err:any) => console.error(err));


